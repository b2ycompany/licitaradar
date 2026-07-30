import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { colunasDocumentoMeta, documentos, licitacoes, perfil } from "@/db/schema";
import { garantirSeed } from "@/lib/seed";
import { avaliarLicitacao, deduplicar } from "@/lib/match";
import { diasAte } from "@/lib/format";
import { medirFim, medirInicio, comTimeout } from "@/lib/perf";
import { comRetry } from "@/lib/retry";
import { executarSync } from "@/lib/sync";
import { FiltroBar } from "@/components/FiltroBar";
import { FaseBadges } from "@/components/FaseBadges";
import { StatsCards } from "@/components/StatsCards";
import { LicitacaoCard } from "@/components/LicitacaoCard";
import { LimparFiltrosAoRecarregar } from "@/components/LimparFiltrosAoRecarregar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Sem limite artificial baixo: até 5.000 linhas avaliadas por
// carregamento (a exibição continua paginada em 120 por vez, mas
// nada fica escondido silenciosamente por um teto pequeno).
const LIMITE_CONSULTA = 5000;
const LIMITE_EXIBICAO = 120;

// Se a última sincronização passou disso, uma nova é disparada
// sozinha em segundo plano ao visitar o dashboard — o usuário não
// precisa clicar em nada para os dados ficarem frescos.
const MINUTOS_PARA_AUTO_SYNC = 20;

type Busca = Record<string, string | string[] | undefined>;

function valorUnico(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  const inicioTotal = medirInicio();

  const params = await searchParams;

  const aba = valorUnico(params.aba) ?? "todas";
  const uf = valorUnico(params.uf);
  const categoria = valorUnico(params.categoria);
  const modalidade = valorUnico(params.modalidade);
  const q = valorUnico(params.q);
  const valorMin = Number(valorUnico(params.valorMin)) || 0;
  const soAptas = valorUnico(params.aptas) === "1";

  const agora = new Date();
  const agoraISO = agora.toISOString();

  await garantirSeed();

  // Monta as condições do filtro dinamicamente. `condicoesBase` não
  // inclui UF — serve para o diagnóstico de distribuição por estado
  // quando o filtro de UF não encontra nada (ver mais abaixo).
  const condicoesBase: (SQL | undefined)[] = [];
  if (aba === "favoritas") condicoesBase.push(eq(licitacoes.favorita, true));
  if (aba === "acompanhando") condicoesBase.push(ne(licitacoes.status, "nova"));
  if (aba === "abertas") {
    condicoesBase.push(
      isNotNull(licitacoes.dataEncerramentoProposta),
      gte(licitacoes.dataEncerramentoProposta, agoraISO),
    );
  }
  if (categoria) condicoesBase.push(eq(licitacoes.categoria, categoria));
  if (modalidade) condicoesBase.push(eq(licitacoes.modalidadeNome, modalidade));
  if (valorMin > 0) condicoesBase.push(gte(licitacoes.valorEstimado, valorMin));
  if (q) {
    condicoesBase.push(
      or(
        ilike(licitacoes.objeto, `%${q}%`),
        ilike(licitacoes.orgao, `%${q}%`),
        ilike(licitacoes.municipio, `%${q}%`),
      ),
    );
  }

  const condicoes: (SQL | undefined)[] = [...condicoesBase];
  if (uf) condicoes.push(eq(licitacoes.uf, uf));

  console.log(
    `[perf] 🔍 filtros: aba=${aba} uf=${uf ?? "-"} categoria=${categoria ?? "-"} modalidade=${modalidade ?? "-"} q="${q ?? ""}" valorMin=${valorMin} soAptas=${soAptas}`,
  );

  const ordem =
    aba === "todas"
      ? desc(licitacoes.dataPublicacao)
      : asc(licitacoes.dataEncerramentoProposta);

  // Consultas independentes disparadas em paralelo. Envolvidas em
  // retry: um pico de instabilidade de rede não derruba a página.
  const inicioConsultas = medirInicio();
  const [
    brutos,
    categoriasLinhas,
    modalidadesLinhas,
    totalLinha,
    perfilLinhas,
    cofre,
  ] = await comRetry(
    () =>
      comTimeout(
        Promise.all([
          db
            .select()
            .from(licitacoes)
            .where(condicoes.length ? and(...condicoes.filter((c): c is SQL => c !== undefined)) : undefined)
            .orderBy(ordem)
            .limit(LIMITE_CONSULTA),
          db
            .selectDistinct({ categoria: licitacoes.categoria })
            .from(licitacoes)
            .orderBy(asc(licitacoes.categoria)),
          db
            .selectDistinct({ modalidade: licitacoes.modalidadeNome })
            .from(licitacoes)
            .where(isNotNull(licitacoes.modalidadeNome))
            .orderBy(asc(licitacoes.modalidadeNome)),
          db.select({ n: count() }).from(licitacoes),
          db.select().from(perfil).limit(1),
          db.select(colunasDocumentoMeta).from(documentos),
        ]),
        15_000,
        "dashboard: 6 consultas",
      ),
    "dashboard: 6 consultas",
  );
  medirFim(inicioConsultas, `dashboard: 6 consultas (aba=${aba})`);
  console.log(`[perf] 🔍 resultado: ${brutos.length} linhas brutas para uf=${uf ?? "(todos)"}`);

  // Diagnóstico: se um filtro de UF não achou nada, mostra o que
  // EXISTE de fato no recorte atual (mesma aba/categoria/etc, sem
  // o filtro de UF) — distingue "seu filtro está certo, só não há
  // dado desse estado ainda" de "o filtro está quebrado".
  let distribuicaoUf: { uf: string | null; n: number }[] = [];
  if (uf && brutos.length === 0) {
    try {
      distribuicaoUf = await comTimeout(
        db
          .select({ uf: licitacoes.uf, n: count() })
          .from(licitacoes)
          .where(
            condicoesBase.length
              ? and(...condicoesBase.filter((c): c is SQL => c !== undefined))
              : undefined,
          )
          .groupBy(licitacoes.uf)
          .orderBy(desc(count())),
        10_000,
        "dashboard: distribuição de UF",
      );
    } catch (erro) {
      // Diagnóstico é auxiliar — se ele travar, não pode derrubar a
      // página inteira. Loga e segue sem a informação extra.
      console.error("[perf] diagnóstico de UF falhou (não crítico):", erro);
    }

    console.log(
      `[perf] 🔍 UF "${uf}" não apareceu. Distribuição real (aba=${aba}): ` +
        (distribuicaoUf.length
          ? distribuicaoUf.map((d) => `${d.uf ?? "(sem UF)"}=${d.n}`).join(", ")
          : "nenhuma linha no recorte atual, nem de outros estados"),
    );
  }

  const perfilEmpresa = perfilLinhas[0] ?? null;

  // Sincronização automática e transparente: se a última vez que
  // importamos dados do PNCP foi há mais de MINUTOS_PARA_AUTO_SYNC,
  // dispara uma atualização em segundo plano com after() — a
  // página já responde com o que tem agora; quando o usuário
  // voltar (ou recarregar), os dados novos já estarão lá.
  const ultimoSync = perfilEmpresa?.ultimoSyncEm ? new Date(perfilEmpresa.ultimoSyncEm) : null;
  const minutosDesdeUltimoSync = ultimoSync
    ? (agora.getTime() - ultimoSync.getTime()) / 60000
    : Infinity;

  if (minutosDesdeUltimoSync > MINUTOS_PARA_AUTO_SYNC) {
    after(async () => {
      console.log(`[perf] 🔄 auto-sync em segundo plano (última há ${Math.round(minutosDesdeUltimoSync)}min)`);
      try {
        await executarSync({ paginasPorEstado: 3 });
      } catch (erro) {
        console.error("[perf] auto-sync falhou:", erro);
      }
    });
  }

  // Remove editais publicados em duplicidade (mesmo órgão + objeto)
  const semDuplicatas = deduplicar(brutos);

  // Avalia cada licitação contra o perfil + cofre de documentos
  let avaliadas = semDuplicatas.map((l) => ({
    licitacao: l,
    avaliacao: avaliarLicitacao(l, perfilEmpresa, cofre, agora),
  }));

  if (soAptas) {
    avaliadas = avaliadas.filter((a) => a.avaliacao.apta);
  }

  // Ordena por aderência (empate: prazo mais próximo primeiro)
  avaliadas.sort((a, b) => b.avaliacao.score - a.avaliacao.score);

  // Estatísticas sobre o conjunto filtrado
  const valorTotal = avaliadas.reduce(
    (soma, a) => soma + (a.licitacao.valorEstimado ?? 0),
    0,
  );
  const encerrandoEm7Dias = avaliadas.filter((a) => {
    const dias = diasAte(a.licitacao.dataEncerramentoProposta);
    return dias !== null && dias >= 0 && dias <= 7;
  }).length;
  const aptas = avaliadas.filter((a) => a.avaliacao.apta).length;

  // Contagem por fase — a pergunta mais básica: quantas eu posso
  // disputar agora vs. quantas já venceram.
  const contagemFase = {
    abertas: avaliadas.filter((a) => a.avaliacao.fase === "recebendo").length,
    emAndamento: avaliadas.filter((a) => a.avaliacao.fase === "aguardando").length,
    encerradas: avaliadas.filter(
      (a) => a.avaliacao.fase === "encerrada" || a.avaliacao.fase === "indefinida",
    ).length,
  };

  const categoriasDisponiveis = categoriasLinhas.map((r) => r.categoria);
  const modalidadesDisponiveis = modalidadesLinhas
    .map((r) => r.modalidade)
    .filter((m): m is string => Boolean(m));
  const totalNoBanco = totalLinha[0]?.n ?? 0;

  const exibidas = avaliadas.slice(0, LIMITE_EXIBICAO);
  const duplicatasOcultas = brutos.length - semDuplicatas.length;

  medirFim(inicioTotal, `dashboard: TOTAL (aba=${aba}, ${brutos.length} linhas)`);

  return (
    <>
      <LimparFiltrosAoRecarregar />
      <FiltroBar
        categorias={categoriasDisponiveis}
        modalidades={modalidadesDisponiveis}
      />

      <p className="mb-4 font-mono text-xs text-cinza">
        {ultimoSync ? (
          <>
            Última sincronização: {ultimoSync.toLocaleString("pt-BR")}
            {minutosDesdeUltimoSync > MINUTOS_PARA_AUTO_SYNC && " · atualizando em segundo plano agora…"}
          </>
        ) : (
          "Ainda sem sincronização — busca automática iniciando em segundo plano…"
        )}
      </p>

      <FaseBadges
        abertas={contagemFase.abertas}
        emAndamento={contagemFase.emAndamento}
        encerradas={contagemFase.encerradas}
      />

      <StatsCards
        total={avaliadas.length}
        valorTotal={valorTotal}
        encerrandoEm7Dias={encerrandoEm7Dias}
        aptas={aptas}
      />

      {totalNoBanco === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-verde bg-white px-6 py-16 text-center">
          <p className="text-2xl font-extrabold">Buscando as primeiras licitações…</p>
          <p className="mx-auto mt-2 max-w-xl text-base text-cinza">
            Seu banco ainda está vazio, mas a sincronização automática já foi
            disparada em segundo plano. Recarregue a página em cerca de 1
            minuto — ou clique em <strong className="text-verde">Sincronizar PNCP</strong>{" "}
            (canto superior direito) para acompanhar ao vivo.
          </p>
          <p className="mt-6 font-mono text-xs uppercase tracking-wide text-cinza">
            Dica: depois, preencha o “Meu perfil” para o radar destacar em verde
            as que você está apta a disputar.
          </p>
        </div>
      ) : exibidas.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-borda bg-white px-6 py-16 text-center">
          <p className="text-xl font-bold">
            {soAptas
              ? "Nenhuma licitação apta com os filtros atuais"
              : "Nada encontrado com esses filtros"}
          </p>
          <p className="mx-auto mt-2 max-w-xl text-base text-cinza">
            {soAptas ? (
              <>
                Há {totalNoBanco.toLocaleString("pt-BR")} licitações no banco,
                mas nenhuma passa no filtro “Apta” — isso acontece quando o
                cofre de documentos do seu perfil ainda não tem os documentos
                marcados/anexados. Preencha o{" "}
                <a href="/perfil" className="font-semibold text-verde underline underline-offset-2">
                  Meu perfil
                </a>{" "}
                ou remova o filtro para ver todas.
              </>
            ) : uf && distribuicaoUf.length > 0 ? (
              <>
                Nenhuma licitação de <strong>{uf}</strong> neste recorte agora.
                O que existe: {distribuicaoUf.map((d) => `${d.uf ?? "sem estado"} (${d.n})`).join(", ")}.
                {" "}Isso costuma ser cobertura parcial do sync (o PNCP limita
                quantas páginas dá para puxar de uma vez) — sincronize de novo
                em alguns minutos para ampliar.
              </>
            ) : (
              "Ajuste os filtros acima ou sincronize novamente para trazer dados mais recentes."
            )}
          </p>
          <a
            href="/"
            className="mt-5 inline-block rounded-md border-2 border-tinta px-4 py-2 text-sm font-semibold hover:bg-tinta hover:text-papel"
          >
            Limpar filtros
          </a>
        </div>
      ) : (
        <>
          <div className="grid items-start gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {exibidas.map((a) => (
              <LicitacaoCard
                key={a.licitacao.id}
                licitacao={a.licitacao}
                avaliacao={a.avaliacao}
              />
            ))}
          </div>

          <p className="mt-4 text-center text-xs text-cinza">
            {avaliadas.length > LIMITE_EXIBICAO
              ? `Mostrando ${LIMITE_EXIBICAO} de ${avaliadas.length} licitações — refine os filtros para ver as demais.`
              : `${avaliadas.length} licitações no filtro.`}
            {duplicatasOcultas > 0 &&
              ` ${duplicatasOcultas} duplicada(s) ocultada(s).`}
          </p>
        </>
      )}
    </>
  );
}

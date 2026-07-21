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
} from "drizzle-orm";
import { db } from "@/db";
import { colunasDocumentoMeta, documentos, licitacoes, perfil } from "@/db/schema";
import { garantirSeed } from "@/lib/seed";
import { avaliarLicitacao, deduplicar } from "@/lib/match";
import { diasAte } from "@/lib/format";
import { medirFim, medirInicio } from "@/lib/perf";
import { FiltroBar } from "@/components/FiltroBar";
import { StatsCards } from "@/components/StatsCards";
import { LicitacaoCard } from "@/components/LicitacaoCard";

export const dynamic = "force-dynamic";

const LIMITE_CONSULTA = 500;
const LIMITE_EXIBICAO = 80;

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

  const aba = valorUnico(params.aba) ?? "abertas";
  const uf = valorUnico(params.uf);
  const categoria = valorUnico(params.categoria);
  const modalidade = valorUnico(params.modalidade);
  const q = valorUnico(params.q);
  const valorMin = Number(valorUnico(params.valorMin)) || 0;
  const soAptas = valorUnico(params.aptas) === "1";

  const agora = new Date();
  const agoraISO = agora.toISOString();

  await garantirSeed();

  // Monta as condições do filtro dinamicamente
  const condicoes = [];
  if (aba === "favoritas") condicoes.push(eq(licitacoes.favorita, true));
  if (aba === "acompanhando") condicoes.push(ne(licitacoes.status, "nova"));
  if (aba === "abertas") {
    condicoes.push(
      isNotNull(licitacoes.dataEncerramentoProposta),
      gte(licitacoes.dataEncerramentoProposta, agoraISO),
    );
  }
  if (uf) condicoes.push(eq(licitacoes.uf, uf));
  if (categoria) condicoes.push(eq(licitacoes.categoria, categoria));
  if (modalidade) condicoes.push(eq(licitacoes.modalidadeNome, modalidade));
  if (valorMin > 0) condicoes.push(gte(licitacoes.valorEstimado, valorMin));
  if (q) {
    condicoes.push(
      or(
        ilike(licitacoes.objeto, `%${q}%`),
        ilike(licitacoes.orgao, `%${q}%`),
        ilike(licitacoes.municipio, `%${q}%`),
      ),
    );
  }

  const ordem =
    aba === "todas"
      ? desc(licitacoes.dataPublicacao)
      : asc(licitacoes.dataEncerramentoProposta);

  // Consultas independentes disparadas em paralelo
  const inicioConsultas = medirInicio();
  const [
    brutos,
    categoriasLinhas,
    modalidadesLinhas,
    totalLinha,
    perfilLinhas,
    cofre,
  ] = await Promise.all([
    db
      .select()
      .from(licitacoes)
      .where(condicoes.length ? and(...condicoes) : undefined)
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
  ]);
  medirFim(inicioConsultas, `dashboard: 6 consultas (aba=${aba})`);

  const perfilEmpresa = perfilLinhas[0] ?? null;

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
      <FiltroBar
        categorias={categoriasDisponiveis}
        modalidades={modalidadesDisponiveis}
      />

      <StatsCards
        total={avaliadas.length}
        valorTotal={valorTotal}
        encerrandoEm7Dias={encerrandoEm7Dias}
        aptas={aptas}
      />

      {totalNoBanco === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-verde bg-white px-6 py-16 text-center">
          <p className="text-2xl font-extrabold">Comece importando as licitações</p>
          <p className="mx-auto mt-2 max-w-xl text-base text-cinza">
            Seu banco ainda está vazio. Clique no botão{" "}
            <strong className="text-verde">Sincronizar PNCP</strong> (canto
            superior direito) para trazer as licitações com propostas em aberto
            de todo o país. Leva alguns segundos.
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
            ) : (
              "Ajuste os filtros acima ou sincronize novamente para trazer dados mais recentes."
            )}
          </p>
          <a
            href={soAptas ? "/?aba=abertas" : "/"}
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

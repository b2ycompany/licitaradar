import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { licitacoes, perfil, type NovaLicitacao } from "@/db/schema";
import {
  buscarPropostasAbertas,
  hojeAAAAMMDD,
  nomeEsfera,
  type EventoTentativa,
  type PncpContratacao,
} from "@/lib/pncp";
import { categorizar } from "@/lib/categorize";
import { medirFim, medirInicio } from "@/lib/perf";
import { PERFIL_ID } from "@/lib/seed";

/**
 * Lógica central de sincronização — estado por estado, ordem
 * embaralhada. Compartilhada entre:
 *  - a rota /api/sync (botão manual, com progresso em stream)
 *  - a rota /api/cron-sync (Vercel Cron, uma vez por dia)
 *  - o gatilho automático em segundo plano (page.tsx, ao visitar
 *    o dashboard com dados velhos)
 *
 * Sem limite artificial baixo: cada estado pode buscar até
 * `paginasPorEstado` páginas (até 500 registros cada). O único
 * limite real é o próprio PNCP, que pausa por rate-limit — e
 * quando isso acontece, devolvemos o que já foi importado em vez
 * de travar tudo.
 */

const TODOS_UF = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

function embaralhar<T>(lista: T[]): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function mapear(c: PncpContratacao, agora: string): NovaLicitacao | null {
  if (!c.numeroControlePNCP) return null;

  return {
    id: c.numeroControlePNCP,
    objeto: c.objetoCompra?.trim() || "(sem descrição do objeto)",
    orgao: c.orgaoEntidade?.razaoSocial ?? "",
    cnpjOrgao: c.orgaoEntidade?.cnpj ?? null,
    unidade: c.unidadeOrgao?.nomeUnidade ?? null,
    municipio: c.unidadeOrgao?.municipioNome ?? null,
    uf: c.unidadeOrgao?.ufSigla ?? null,
    esfera: nomeEsfera(c.orgaoEntidade?.esferaId),
    modalidadeId: c.modalidadeId ?? null,
    modalidadeNome: c.modalidadeNome ?? null,
    situacao: c.situacaoCompraNome ?? null,
    valorEstimado: c.valorTotalEstimado ?? null,
    dataPublicacao: c.dataPublicacaoPncp ?? null,
    dataAberturaProposta: c.dataAberturaProposta ?? null,
    dataEncerramentoProposta: c.dataEncerramentoProposta ?? null,
    anoCompra: c.anoCompra ?? null,
    sequencialCompra: c.sequencialCompra ?? null,
    srp: Boolean(c.srp),
    linkOrigem: c.linkSistemaOrigem ?? null,
    categoria: categorizar(c.objetoCompra ?? ""),
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

function sqlExcluded(coluna: string) {
  return sql.raw(`excluded."${coluna}"`);
}

export interface ResultadoSync {
  importadas: number;
  estadosConcluidos: number;
  totalEstados: number;
  estadosFaltando: string[];
  aviso: string | null;
  jaEmAndamento?: boolean;
}

/** Acima disso, um sync "em andamento" é considerado travado/morto e liberado. */
const TRAVA_CONSIDERADA_MORTA_MS = 5 * 60 * 1000;

export async function executarSync(opcoes: {
  paginasPorEstado?: number;
  aoEvento?: (evento: Record<string, unknown>) => void;
}): Promise<ResultadoSync> {
  const paginasPorEstado = Math.min(Math.max(opcoes.paginasPorEstado ?? 3, 1), 10);
  const aoEvento = opcoes.aoEvento ?? (() => {});

  // Trava: só um sync roda por vez. Sem isso, cada visita ao
  // dashboard (ou clique no botão) enquanto um sync já está
  // rodando disparava OUTRO por cima — múltiplos syncs brigando
  // pelas mesmas conexões do banco e martelando o PNCP juntos foi
  // a causa real da lentidão extrema.
  const [linhaAtual] = await db
    .select({ syncDesde: perfil.syncEmAndamentoDesde })
    .from(perfil)
    .where(eq(perfil.id, PERFIL_ID))
    .limit(1);

  const syncDesdeMs = linhaAtual?.syncDesde ? new Date(linhaAtual.syncDesde).getTime() : null;
  const travado = syncDesdeMs !== null && Date.now() - syncDesdeMs < TRAVA_CONSIDERADA_MORTA_MS;

  if (travado) {
    console.log("[perf] sync: já em andamento (outra chamada) — pulando");
    aoEvento({ tipo: "ja_em_andamento" });
    return {
      importadas: 0,
      estadosConcluidos: 0,
      totalEstados: TODOS_UF.length,
      estadosFaltando: TODOS_UF,
      aviso: "Já existe uma sincronização em andamento — aguarde ela terminar.",
      jaEmAndamento: true,
    };
  }

  await db
    .update(perfil)
    .set({ syncEmAndamentoDesde: new Date().toISOString() })
    .where(eq(perfil.id, PERFIL_ID));

  const inicioTotal = medirInicio();
  const dataFinal = hojeAAAAMMDD();
  const agora = new Date().toISOString();
  const ordemEstados = embaralhar(TODOS_UF);

  let importadas = 0;
  const estadosConcluidos: string[] = [];
  let avisoLimite: string | null = null;
  let pararTudo = false;

  console.log(
    `[perf] sync: iniciando por estado (${ordemEstados.length} UFs, ${paginasPorEstado} páginas cada)`,
  );

  try {
    for (const uf of ordemEstados) {
    if (pararTudo) break;

    let totalNoEstado = 0;

    for (let pagina = 1; pagina <= paginasPorEstado; pagina++) {
      let resposta;
      try {
        resposta = await buscarPropostasAbertas(
          { dataFinal, pagina, uf },
          (ev: EventoTentativa) =>
            aoEvento({
              tipo: "tentativa",
              uf,
              pagina: ev.pagina,
              tentativa: ev.tentativa,
              maxTentativas: ev.maxTentativas,
              motivo: ev.motivo,
              esperaMs: ev.esperaMs,
            }),
        );
      } catch (erro) {
        avisoLimite = erro instanceof Error ? erro.message : "Limite do PNCP atingido.";
        pararTudo = true;
        break;
      }

      const itens = resposta.data ?? [];
      const valores = itens
        .map((item) => mapear(item, agora))
        .filter((v): v is NovaLicitacao => v !== null);

      if (valores.length > 0) {
        await db
          .insert(licitacoes)
          .values(valores)
          .onConflictDoUpdate({
            target: licitacoes.id,
            set: {
              objeto: sqlExcluded("objeto"),
              orgao: sqlExcluded("orgao"),
              cnpjOrgao: sqlExcluded("cnpj_orgao"),
              unidade: sqlExcluded("unidade"),
              municipio: sqlExcluded("municipio"),
              uf: sqlExcluded("uf"),
              esfera: sqlExcluded("esfera"),
              modalidadeId: sqlExcluded("modalidade_id"),
              modalidadeNome: sqlExcluded("modalidade_nome"),
              situacao: sqlExcluded("situacao"),
              valorEstimado: sqlExcluded("valor_estimado"),
              dataPublicacao: sqlExcluded("data_publicacao"),
              dataAberturaProposta: sqlExcluded("data_abertura_proposta"),
              dataEncerramentoProposta: sqlExcluded("data_encerramento_proposta"),
              anoCompra: sqlExcluded("ano_compra"),
              sequencialCompra: sqlExcluded("sequencial_compra"),
              srp: sqlExcluded("srp"),
              linkOrigem: sqlExcluded("link_origem"),
              categoria: sqlExcluded("categoria"),
              atualizadoEm: sqlExcluded("atualizado_em"),
            },
          });
        importadas += valores.length;
        totalNoEstado += valores.length;
      }

      const totalPaginasEstado = resposta.totalPaginas ?? 0;

      aoEvento({
        tipo: "estado",
        uf,
        pagina,
        totalPaginasEstado,
        importadasNoEstado: totalNoEstado,
        totalImportadas: importadas,
        estadosConcluidos: estadosConcluidos.length,
        totalEstados: ordemEstados.length,
      });

      if (pagina >= totalPaginasEstado) break;
    }

    if (!pararTudo) estadosConcluidos.push(uf);
  }
  } finally {
    // Libera a trava e registra quando terminou — SEMPRE, mesmo em
    // caso de erro, para nunca deixar o sistema travado achando
    // que um sync "morreu" ainda está rodando.
    await db
      .update(perfil)
      .set({ syncEmAndamentoDesde: null, ultimoSyncEm: new Date().toISOString() })
      .where(eq(perfil.id, PERFIL_ID));
  }

  medirFim(
    inicioTotal,
    `sync: TOTAL (${importadas} licitações, ${estadosConcluidos.length}/${ordemEstados.length} estados completos)`,
  );

  return {
    importadas,
    estadosConcluidos: estadosConcluidos.length,
    totalEstados: ordemEstados.length,
    estadosFaltando: ordemEstados.filter((u) => !estadosConcluidos.includes(u)),
    aviso: avisoLimite,
  };
}

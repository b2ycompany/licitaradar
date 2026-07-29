import { sql } from "drizzle-orm";
import { db } from "@/db";
import { licitacoes, type NovaLicitacao } from "@/db/schema";
import {
  buscarPropostasAbertas,
  hojeAAAAMMDD,
  nomeEsfera,
  type PncpContratacao,
} from "@/lib/pncp";
import { categorizar } from "@/lib/categorize";
import { medirFim, medirInicio } from "@/lib/perf";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * Todos os 26 estados + DF. A ordem é embaralhada a cada
 * sincronização — se o PNCP limitar o ritmo antes de terminar
 * (acontece com frequência), sync após sync a cobertura vai se
 * equilibrando entre TODOS os estados, em vez de sempre parar nos
 * mesmos primeiros da lista.
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

/**
 * POST /api/sync?paginasPorEstado=2
 *
 * Varre licitações com propostas em aberto ESTADO POR ESTADO (os
 * 27 estados, em ordem embaralhada), em vez de uma paginação
 * nacional "cega" — que na prática só alcançava as primeiras ~9
 * páginas antes do PNCP limitar o ritmo, deixando estados inteiros
 * de fora (foi o caso do Pará). Responde em stream (ND-JSON).
 */
export async function POST(req: Request) {
  const inicioTotal = medirInicio();
  const { searchParams } = new URL(req.url);
  const paginasPorEstado = Math.min(
    Math.max(Number(searchParams.get("paginasPorEstado")) || 2, 1),
    5,
  );

  const dataFinal = hojeAAAAMMDD();
  const agora = new Date().toISOString();
  const codificador = new TextEncoder();
  const ordemEstados = embaralhar(TODOS_UF);

  const stream = new ReadableStream({
    async start(controller) {
      function enviar(evento: Record<string, unknown>) {
        controller.enqueue(codificador.encode(JSON.stringify(evento) + "\n"));
      }

      let importadas = 0;
      const estadosConcluidos: string[] = [];
      let avisoLimite: string | null = null;
      let pararTudo = false;

      enviar({ tipo: "inicio", totalEstados: ordemEstados.length, paginasPorEstado });
      console.log(
        `[perf] sync: iniciando por estado (${ordemEstados.length} UFs, ${paginasPorEstado} páginas cada). Ordem: ${ordemEstados.join(",")}`,
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
                (ev) =>
                  enviar({
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
              // PNCP esgotou as tentativas nesse estado. Se já
              // importamos algo, encerra graciosamente com o que
              // temos em vez de perder tudo.
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

            enviar({
              tipo: "estado",
              uf,
              pagina,
              totalPaginasEstado,
              importadasNoEstado: totalNoEstado,
              totalImportadas: importadas,
              estadosConcluidos: estadosConcluidos.length,
              totalEstados: ordemEstados.length,
            });

            // Não insiste em páginas que o próprio estado não tem
            if (pagina >= totalPaginasEstado) break;
          }

          if (!pararTudo) estadosConcluidos.push(uf);
        }

        medirFim(
          inicioTotal,
          `sync: TOTAL (${importadas} licitações, ${estadosConcluidos.length}/${ordemEstados.length} estados completos)`,
        );

        enviar({
          tipo: "fim",
          ok: true,
          importadas,
          estadosConcluidos: estadosConcluidos.length,
          totalEstados: ordemEstados.length,
          estadosFaltando: ordemEstados.filter((u) => !estadosConcluidos.includes(u)),
          aviso: avisoLimite,
        });
      } catch (erro) {
        console.error("Erro ao sincronizar com o PNCP:", erro);
        enviar({
          tipo: "fim",
          ok: false,
          erro: erro instanceof Error ? erro.message : "Erro desconhecido no sync",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** GET como atalho para testar no navegador ou via curl. */
export async function GET(req: Request) {
  return POST(req);
}

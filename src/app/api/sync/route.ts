import { sql } from "drizzle-orm";
import { db } from "@/db";
import { licitacoes, type NovaLicitacao } from "@/db/schema";
import {
  buscarPropostasAbertas,
  hojeAAAAMMDD,
  nomeEsfera,
  type EventoTentativa,
  type PncpContratacao,
} from "@/lib/pncp";
import { categorizar } from "@/lib/categorize";
import { medirFim, medirInicio } from "@/lib/perf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Converte uma contratação do PNCP para o formato do banco. */
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
 * POST /api/sync?paginas=20
 *
 * Responde em STREAM (ND-JSON — uma linha de JSON por evento) em
 * vez de esperar tudo terminar para responder uma vez só. Isso
 * permite à tela mostrar o progresso página a página em tempo
 * real, inclusive durante as esperas de rate-limit do PNCP.
 */
export async function POST(req: Request) {
  const inicioTotal = medirInicio();
  const { searchParams } = new URL(req.url);
  const maxPaginas = Math.min(
    Math.max(Number(searchParams.get("paginas")) || 20, 1),
    40,
  );

  const dataFinal = hojeAAAAMMDD();
  const agora = new Date().toISOString();
  const codificador = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function enviar(evento: Record<string, unknown>) {
        controller.enqueue(codificador.encode(JSON.stringify(evento) + "\n"));
      }

      let pagina = 1;
      let totalPaginas = 1;
      let importadas = 0;
      let avisoLimite: string | null = null;

      enviar({ tipo: "inicio", maxPaginas });
      console.log(`[perf] sync: iniciando, até ${maxPaginas} páginas`);

      const aoTentar = (ev: EventoTentativa) => {
        enviar({
          tipo: "tentativa",
          pagina: ev.pagina,
          tentativa: ev.tentativa,
          maxTentativas: ev.maxTentativas,
          motivo: ev.motivo,
          esperaMs: ev.esperaMs,
        });
      };

      try {
        do {
          let resposta;
          try {
            resposta = await buscarPropostasAbertas({ dataFinal, pagina }, aoTentar);
          } catch (erro) {
            if (importadas > 0) {
              avisoLimite =
                erro instanceof Error ? erro.message : "Limite do PNCP atingido.";
              break;
            }
            throw erro;
          }

          totalPaginas = resposta.totalPaginas ?? 0;

          const itens = resposta.data ?? [];
          const valores = itens
            .map((item) => mapear(item, agora))
            .filter((v): v is NovaLicitacao => v !== null);

          if (valores.length > 0) {
            const inicioUpsert = medirInicio();
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
                  dataEncerramentoProposta: sqlExcluded(
                    "data_encerramento_proposta",
                  ),
                  anoCompra: sqlExcluded("ano_compra"),
                  sequencialCompra: sqlExcluded("sequencial_compra"),
                  srp: sqlExcluded("srp"),
                  linkOrigem: sqlExcluded("link_origem"),
                  categoria: sqlExcluded("categoria"),
                  atualizadoEm: sqlExcluded("atualizado_em"),
                },
              });
            medirFim(inicioUpsert, `sync: upsert página ${pagina} (${valores.length} linhas)`);
            importadas += valores.length;
          }

          enviar({
            tipo: "pagina",
            pagina,
            totalPaginas,
            maxPaginas,
            importadasNaPagina: valores.length,
            totalImportadas: importadas,
          });

          pagina++;
        } while (pagina <= totalPaginas && pagina <= maxPaginas);

        medirFim(inicioTotal, `sync: TOTAL (${importadas} licitações, ${pagina - 1} páginas)`);

        enviar({
          tipo: "fim",
          ok: true,
          importadas,
          paginasLidas: pagina - 1,
          totalPaginasDisponiveis: totalPaginas,
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

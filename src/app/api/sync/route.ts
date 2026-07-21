import { NextResponse } from "next/server";
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

/** Referência ao valor "excluded" do ON CONFLICT DO UPDATE do Postgres. */
function sqlExcluded(coluna: string) {
  return sql.raw(`excluded."${coluna}"`);
}

/**
 * POST /api/sync?paginas=20
 * Busca no PNCP as contratações com propostas em aberto e faz
 * upsert no banco. Campos do usuário (favorita, status) são
 * preservados nas atualizações. O controle de ritmo (pausa e
 * retry em 429) fica dentro do cliente em src/lib/pncp.ts.
 *
 * Se o PNCP limitar as requisições no meio do caminho, a rota
 * devolve o que já conseguiu importar em vez de falhar tudo.
 */
export async function POST(req: Request) {
  const inicioTotal = medirInicio();
  const { searchParams } = new URL(req.url);
  const maxPaginas = Math.min(
    Math.max(Number(searchParams.get("paginas")) || 20, 1),
    40,
  );
  console.log(`[perf] sync: iniciando, até ${maxPaginas} páginas`);

  const dataFinal = hojeAAAAMMDD();
  const agora = new Date().toISOString();

  let pagina = 1;
  let totalPaginas = 1;
  let importadas = 0;
  let avisoLimite: string | null = null;

  try {
    do {
      let resposta;
      try {
        resposta = await buscarPropostasAbertas({ dataFinal, pagina });
      } catch (erro) {
        // Rate limit no meio da importação: mantém o que já entrou
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
        // Upsert em lote: 1 ida ao banco por página. Atualiza os
        // dados oficiais sem tocar em criadoEm, favorita e status.
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

      pagina++;
    } while (pagina <= totalPaginas && pagina <= maxPaginas);

    medirFim(inicioTotal, `sync: TOTAL (${importadas} licitações, ${pagina - 1} páginas)`);

    return NextResponse.json({
      ok: true,
      importadas,
      paginasLidas: pagina - 1,
      totalPaginasDisponiveis: totalPaginas,
      ...(avisoLimite ? { aviso: avisoLimite } : {}),
    });
  } catch (erro) {
    console.error("Erro ao sincronizar com o PNCP:", erro);
    return NextResponse.json(
      {
        ok: false,
        erro:
          erro instanceof Error ? erro.message : "Erro desconhecido no sync",
      },
      { status: 502 },
    );
  }
}

/** GET como atalho para testar no navegador ou via curl. */
export async function GET(req: Request) {
  return POST(req);
}

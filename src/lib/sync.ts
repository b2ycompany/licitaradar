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
import {
  buscarLicitacoesComprasNet,
  extrairIdUnico,
  extrairMunicipio,
  extrairObjeto,
  extrairOrgao,
  extrairUf,
} from "@/lib/comprasnet";

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

/** Normaliza texto para comparação entre fontes diferentes (remove
 * acento, caixa, pontuação, e corta em 100 caracteres — o
 * suficiente pra identificar "é o mesmo objeto" sem exigir
 * igualdade perfeita, já que PNCP e ComprasNet nunca escrevem o
 * objeto exatamente igual). */
function normalizarObjeto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
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

  // Varredura nacional extra, SEM filtro de UF — pega órgãos
  // federais e entidades cuja unidade não se encaixa bem numa
  // única UF (ex.: bancos públicos federais, autarquias com
  // jurisdição nacional). O sync por estado sozinho pode deixar
  // esse tipo de caso de fora.
  if (!pararTudo) {
    for (let pagina = 1; pagina <= paginasPorEstado; pagina++) {
      let resposta;
      try {
        resposta = await buscarPropostasAbertas(
          { dataFinal, pagina },
          (ev: EventoTentativa) =>
            aoEvento({
              tipo: "tentativa",
              uf: "BR (nacional)",
              pagina: ev.pagina,
              tentativa: ev.tentativa,
              maxTentativas: ev.maxTentativas,
              motivo: ev.motivo,
              esperaMs: ev.esperaMs,
            }),
        );
      } catch {
        break; // varredura nacional é um extra — se falhar, não é motivo pra marcar aviso
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
      }

      const totalPaginasNacional = resposta.totalPaginas ?? 0;

      aoEvento({
        tipo: "estado",
        uf: "BR (nacional)",
        pagina,
        totalPaginasEstado: totalPaginasNacional,
        importadasNoEstado: valores.length,
        totalImportadas: importadas,
        estadosConcluidos: estadosConcluidos.length,
        totalEstados: ordemEstados.length,
      });

      if (pagina >= totalPaginasNacional) break;
    }
  }

  // ComprasNet legado — fonte DIFERENTE do PNCP (Lei 8.666/10.520,
  // processos de transição). Roda mesmo que o PNCP tenha parado
  // cedo (rate-limit) — são APIs independentes, uma travar não deve
  // impedir a outra. Antes de importar, cruza com o que já existe
  // do PNCP (mesmo CNPJ do órgão + objeto parecido) — só entra o
  // que NÃO está duplicado.
  {
    try {
      // Carrega uma vez as chaves do PNCP para comparar em memória,
      // em vez de 1 consulta por item do ComprasNet.
      const existentesPncp = await db
        .select({ cnpjOrgao: licitacoes.cnpjOrgao, objeto: licitacoes.objeto })
        .from(licitacoes)
        .where(eq(licitacoes.fonte, "pncp"));

      const chavesPncp = new Set(
        existentesPncp
          .filter((l) => l.cnpjOrgao)
          .map((l) => `${l.cnpjOrgao}|${normalizarObjeto(l.objeto)}`),
      );

      let offset = 0;
      const PAGINA_COMPRASNET = 500;
      let importadasComprasnet = 0;
      let duplicadasIgnoradas = 0;

      for (let tentativaPagina = 0; tentativaPagina < paginasPorEstado; tentativaPagina++) {
        let itens: Awaited<ReturnType<typeof buscarLicitacoesComprasNet>>;
        try {
          itens = await buscarLicitacoesComprasNet({ diasRecentes: 30, offset });
        } catch (erro) {
          console.log(
            `[perf] 🟡 ComprasNet: ${erro instanceof Error ? erro.message : "falhou"} — pulando essa fonte`,
          );
          break;
        }

        if (itens.length === 0) break;

        const valoresNovos: NovaLicitacao[] = [];

        for (const item of itens) {
          const idUnico = extrairIdUnico(item);
          const objeto = extrairObjeto(item);
          const orgaoNome = extrairOrgao(item);
          if (!idUnico || !objeto) continue;

          // Sem CNPJ do órgão nessa API por padrão — o dedup aqui é
          // por nome do órgão + objeto normalizado (mais fraco que
          // CNPJ, mas evita a maioria das duplicatas óbvias).
          const chave = `${orgaoNome.toLowerCase().trim()}|${normalizarObjeto(objeto)}`;
          const duplicataProvavel = [...chavesPncp].some((c) => c.endsWith(`|${normalizarObjeto(objeto)}`));

          if (duplicataProvavel) {
            duplicadasIgnoradas++;
            continue;
          }

          valoresNovos.push({
            id: idUnico,
            fonte: "comprasnet",
            objeto,
            orgao: orgaoNome,
            cnpjOrgao: null,
            unidade: null,
            municipio: extrairMunicipio(item),
            uf: extrairUf(item),
            esfera: "Federal",
            modalidadeId: null,
            modalidadeNome: item.modalidade ?? item.ds_modalidade ?? null,
            situacao: item.situacao ?? null,
            valorEstimado: item.valor_estimado ?? null,
            dataPublicacao: null,
            dataAberturaProposta: item.dt_abertura_proposta ?? item.data_abertura_proposta ?? null,
            dataEncerramentoProposta: item.dt_abertura_proposta ?? item.data_abertura_proposta ?? null,
            anoCompra: null,
            sequencialCompra: null,
            srp: false,
            linkOrigem: null,
            categoria: categorizar(objeto),
            criadoEm: agora,
            atualizadoEm: agora,
          });

          chavesPncp.add(chave); // evita duplicar entre si dentro do próprio ComprasNet
        }

        if (valoresNovos.length > 0) {
          await db.insert(licitacoes).values(valoresNovos).onConflictDoNothing();
          importadasComprasnet += valoresNovos.length;
          importadas += valoresNovos.length;
        }

        aoEvento({
          tipo: "estado",
          uf: "ComprasNet",
          pagina: tentativaPagina + 1,
          totalPaginasEstado: paginasPorEstado,
          importadasNoEstado: importadasComprasnet,
          totalImportadas: importadas,
          estadosConcluidos: estadosConcluidos.length,
          totalEstados: ordemEstados.length,
        });

        offset += PAGINA_COMPRASNET;
        if (itens.length < PAGINA_COMPRASNET) break;
      }

      console.log(
        `[perf] ComprasNet: ${importadasComprasnet} novas, ${duplicadasIgnoradas} ignoradas por já existirem no PNCP`,
      );
    } catch (erro) {
      console.log(`[perf] 🟡 ComprasNet indisponível: ${erro instanceof Error ? erro.message : erro}`);
    }
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

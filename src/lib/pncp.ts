/**
 * Cliente da API pública de Consulta do PNCP (Portal Nacional de
 * Contratações Públicas). Não requer autenticação.
 *
 * Manual: https://www.gov.br/pncp/pt-br/acesso-a-informacao/manuais
 * Base:   https://pncp.gov.br/api/consulta
 */

import { medirFim, medirInicio } from "@/lib/perf";

const BASE_URL = "https://pncp.gov.br/api/consulta";

/** Formato parcial de uma contratação retornada pela API. */
export interface PncpContratacao {
  numeroControlePNCP?: string;
  objetoCompra?: string;
  valorTotalEstimado?: number;
  modalidadeId?: number;
  modalidadeNome?: string;
  situacaoCompraNome?: string;
  dataPublicacaoPncp?: string;
  dataAberturaProposta?: string;
  dataEncerramentoProposta?: string;
  anoCompra?: number;
  sequencialCompra?: number;
  srp?: boolean;
  linkSistemaOrigem?: string;
  orgaoEntidade?: {
    cnpj?: string;
    razaoSocial?: string;
    esferaId?: string;
  };
  unidadeOrgao?: {
    nomeUnidade?: string;
    municipioNome?: string;
    ufSigla?: string;
  };
}

export interface PncpResposta {
  data?: PncpContratacao[];
  totalRegistros?: number;
  totalPaginas?: number;
  numeroPagina?: number;
  paginasRestantes?: number;
  empty?: boolean;
}

/** Data de hoje no formato exigido pela API (yyyyMMdd). */
export function hojeAAAAMMDD(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}${mm}${dd}`;
}

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extrai o header Retry-After (em segundos) de uma resposta 429, se presente. */
function retryAfterMs(res: Response): number | null {
  const header = res.headers.get("Retry-After");
  if (!header) return null;
  const segundos = Number(header);
  return Number.isFinite(segundos) ? segundos * 1000 : null;
}

/**
 * fetch com timeout — SEM isso, se a rede/PNCP travar no meio da
 * resposta, a chamada fica pendurada para sempre. 25s dá folga
 * para a infraestrutura do PNCP, que às vezes é lenta, sem travar
 * a tela indefinidamente. Erros de timeout são sinalizados com
 * `timeout: true` para o chamador decidir se tenta de novo.
 */
class ErroTimeoutPncp extends Error {
  timeout = true as const;
}

async function fetchComTimeout(
  url: string,
  timeoutMs = 25_000,
): Promise<Response> {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controlador.signal,
    });
  } catch (erro) {
    if (erro instanceof Error && erro.name === "AbortError") {
      throw new ErroTimeoutPncp(
        `PNCP não respondeu em ${timeoutMs / 1000}s (timeout de rede)`,
      );
    }
    throw erro;
  } finally {
    clearTimeout(timer);
  }
}

/** Pausa mínima entre chamadas consecutivas ao PNCP, mesmo sem erro. */
const PAUSA_ENTRE_PAGINAS_MS = 400;
const MAX_TENTATIVAS = 5;
const BACKOFF_BASE_MS = 1000;

export interface EventoTentativa {
  pagina: number;
  tentativa: number;
  maxTentativas: number;
  motivo: "timeout" | "429";
  esperaMs: number;
}

/**
 * 6.4 do manual — Contratações com período de recebimento de
 * propostas em aberto. É o endpoint mais útil para prospecção:
 * retorna apenas licitações em que ainda dá tempo de participar.
 *
 * `aoTentar` (opcional) é chamado antes de cada espera/retry —
 * permite ao chamador transmitir progresso em tempo real (usado
 * pela rota /api/sync para "narrar" o que está acontecendo).
 */
export async function buscarPropostasAbertas(
  params: {
    dataFinal: string;
    pagina: number;
    tamanhoPagina?: number;
    codigoModalidade?: number;
    uf?: string;
  },
  aoTentar?: (evento: EventoTentativa) => void,
): Promise<PncpResposta> {
  const url = new URL(`${BASE_URL}/v1/contratacoes/proposta`);
  url.searchParams.set("dataFinal", params.dataFinal);
  url.searchParams.set("pagina", String(params.pagina));
  url.searchParams.set("tamanhoPagina", String(params.tamanhoPagina ?? 50));
  if (params.codigoModalidade) {
    url.searchParams.set(
      "codigoModalidadeContratacao",
      String(params.codigoModalidade),
    );
  }
  if (params.uf) {
    url.searchParams.set("uf", params.uf);
  }

  // Pausa fixa antes de cada chamada — evita disparar todas as
  // páginas em sequência imediata e já reduz a chance de 429.
  await aguardar(PAUSA_ENTRE_PAGINAS_MS);

  let ultimoErro: unknown;
  const inicioPagina = medirInicio();

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    // O fetch fica DENTRO do laço: timeout de rede agora é tratado
    // como qualquer outra falha transitória — tenta de novo em vez
    // de derrubar a sincronização inteira na primeira lentidão.
    let res: Response;
    try {
      res = await fetchComTimeout(url.toString());
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa === MAX_TENTATIVAS) break;
      const espera = BACKOFF_BASE_MS * 2 ** (tentativa - 1) + Math.random() * 300;
      aoTentar?.({
        pagina: params.pagina,
        tentativa,
        maxTentativas: MAX_TENTATIVAS,
        motivo: "timeout",
        esperaMs: Math.round(espera),
      });
      console.log(
        `[perf] 🟡 PNCP página ${params.pagina}: timeout, tentando de novo em ${Math.round(espera)}ms (tentativa ${tentativa}/${MAX_TENTATIVAS})`,
      );
      await aguardar(espera);
      continue;
    }

    // 204: consulta válida porém sem resultados
    if (res.status === 204) {
      medirFim(inicioPagina, `PNCP página ${params.pagina} (204 vazio)`);
      return { data: [], totalPaginas: 0 };
    }

    if (res.status === 429) {
      const corpo = await res.text().catch(() => "");
      ultimoErro = new Error(
        `PNCP respondeu 429 (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${corpo.slice(0, 200)}`,
      );

      if (tentativa === MAX_TENTATIVAS) break;

      // Respeita Retry-After se vier no header; senão usa backoff
      // exponencial com jitter: 1s, 2s, 4s, 8s (+ até 300ms de ruído)
      const espera =
        retryAfterMs(res) ??
        BACKOFF_BASE_MS * 2 ** (tentativa - 1) + Math.random() * 300;

      aoTentar?.({
        pagina: params.pagina,
        tentativa,
        maxTentativas: MAX_TENTATIVAS,
        motivo: "429",
        esperaMs: Math.round(espera),
      });

      console.log(
        `[perf] 🟡 PNCP página ${params.pagina}: 429, esperando ${Math.round(espera)}ms (tentativa ${tentativa}/${MAX_TENTATIVAS})`,
      );

      await aguardar(espera);
      continue;
    }

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      throw new Error(`PNCP respondeu ${res.status}: ${corpo.slice(0, 300)}`);
    }

    const json = (await res.json()) as PncpResposta;
    medirFim(inicioPagina, `PNCP página ${params.pagina}${params.uf ? ` (uf=${params.uf})` : ""}`);
    return json;
  }

  throw ultimoErro instanceof Error
    ? ultimoErro
    : new Error("PNCP: limite de tentativas excedido");
}

/** Converte o esferaId do PNCP em nome legível. */
export function nomeEsfera(esferaId?: string): string | null {
  switch (esferaId) {
    case "F":
      return "Federal";
    case "E":
      return "Estadual";
    case "M":
      return "Municipal";
    case "D":
      return "Distrital";
    default:
      return null;
  }
}

/** Formato parcial de um contrato retornado pelo endpoint /v1/contratos. */
export interface PncpContrato {
  numeroControlePNCP?: string;
  numeroControlePNCPCompra?: string;
  objetoContrato?: string;
  categoriaProcesso?: { id?: number; nome?: string };
  niFornecedor?: string;
  nomeRazaoSocialFornecedor?: string;
  valorInicial?: number;
  valorGlobal?: number;
  dataAssinatura?: string;
  orgaoEntidade?: { cnpj?: string; razaoSocial?: string };
  unidadeOrgao?: { municipioNome?: string; ufSigla?: string };
}

/**
 * 6.6 do manual — Consultar Contratos por Data de Publicação. É o
 * único endpoint do PNCP que traz QUEM ganhou (nome/CNPJ do
 * fornecedor) — a base da inteligência competitiva. Filtrar por
 * cnpjOrgao busca o histórico de um órgão específico.
 */
export async function buscarContratosPorPeriodo(params: {
  dataInicial: string;
  dataFinal: string;
  pagina: number;
  tamanhoPagina?: number;
  cnpjOrgao?: string;
}): Promise<{ data: PncpContrato[]; totalPaginas: number }> {
  const url = new URL(`${BASE_URL}/v1/contratos`);
  url.searchParams.set("dataInicial", params.dataInicial);
  url.searchParams.set("dataFinal", params.dataFinal);
  url.searchParams.set("pagina", String(params.pagina));
  url.searchParams.set("tamanhoPagina", String(params.tamanhoPagina ?? 500));
  if (params.cnpjOrgao) {
    url.searchParams.set("cnpjOrgao", params.cnpjOrgao);
  }

  let ultimoErro: unknown;
  const inicio = medirInicio();

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    let res: Response;
    try {
      res = await fetchComTimeout(url.toString());
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa === MAX_TENTATIVAS) break;
      const espera = BACKOFF_BASE_MS * 2 ** (tentativa - 1) + Math.random() * 300;
      await aguardar(espera);
      continue;
    }

    if (res.status === 204) {
      medirFim(inicio, `PNCP contratos página ${params.pagina} (204 vazio)`);
      return { data: [], totalPaginas: 0 };
    }

    if (res.status === 429) {
      const corpo = await res.text().catch(() => "");
      ultimoErro = new Error(
        `PNCP respondeu 429 (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${corpo.slice(0, 200)}`,
      );
      if (tentativa === MAX_TENTATIVAS) break;
      const espera =
        retryAfterMs(res) ??
        BACKOFF_BASE_MS * 2 ** (tentativa - 1) + Math.random() * 300;
      await aguardar(espera);
      continue;
    }

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      throw new Error(`PNCP respondeu ${res.status}: ${corpo.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      data?: PncpContrato[];
      totalPaginas?: number;
    };
    medirFim(inicio, `PNCP contratos página ${params.pagina}`);
    return { data: json.data ?? [], totalPaginas: json.totalPaginas ?? 0 };
  }

  throw ultimoErro instanceof Error
    ? ultimoErro
    : new Error("PNCP: limite de tentativas excedido");
}

/** Link oficial da página do edital no portal do PNCP. */
export function linkEditalPncp(l: {
  cnpjOrgao?: string | null;
  anoCompra?: number | null;
  sequencialCompra?: number | null;
}): string | null {
  if (!l.cnpjOrgao || !l.anoCompra || !l.sequencialCompra) return null;
  return `https://pncp.gov.br/app/editais/${l.cnpjOrgao}/${l.anoCompra}/${l.sequencialCompra}`;
}

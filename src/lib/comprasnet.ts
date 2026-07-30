/**
 * Cliente do ComprasNet legado (compras.dados.gov.br) — API pública
 * de dados abertos do Governo Federal (SIASG), cobrindo processos
 * ainda regidos pela Lei 8.666/93 e 10.520/2002. É uma fonte
 * DIFERENTE do PNCP (que é focado na Lei 14.133): alguns órgãos
 * federais ainda têm processos de transição só aqui.
 *
 * Documentação oficial: https://compras.dados.gov.br/docs/home.html
 * (a página de docs específica de /licitacoes esteve fora do ar no
 * momento em que isso foi escrito — os nomes de campo abaixo vêm de
 * exemplos públicos; o parser é defensivo: se um campo vier com
 * nome diferente do esperado, o registro é ignorado em vez de
 * quebrar a importação inteira).
 */

const BASE_URL = "https://compras.dados.gov.br";

/** Formato aproximado de uma licitação retornada pela API. Campos
 * marcados com `?` porque a doc oficial não estava acessível para
 * confirmar 100% — o mapeamento tenta múltiplos nomes possíveis. */
export interface ComprasNetLicitacao {
  numero_aviso?: string;
  identificador?: string;
  co_licitacao?: string | number;
  objeto?: string;
  ds_objeto?: string;
  modalidade?: string;
  ds_modalidade?: string;
  uasg?: { codigo?: string; nome?: string; municipio?: string; uf?: string };
  nu_uasg?: string;
  situacao?: string;
  dt_abertura_proposta?: string;
  data_abertura_proposta?: string;
  valor_estimado?: number;
}

interface ComprasNetResposta {
  _embedded?: { licitacoes?: ComprasNetLicitacao[] };
}

/** yyyy-mm-dd de N dias atrás — formato exigido pela API. */
function diasAtrasYyyyMmDd(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

async function fetchComTimeout(url: string, timeoutMs = 20_000): Promise<Response> {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { Accept: "application/json" }, signal: controlador.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Busca licitações do ComprasNet legado publicadas nos últimos
 * `diasRecentes` dias. A API pagina por `offset` (não por número de
 * página) — 500 registros por página é o padrão documentado.
 */
export async function buscarLicitacoesComprasNet(params: {
  diasRecentes: number;
  offset: number;
}): Promise<ComprasNetLicitacao[]> {
  const dataMin = diasAtrasYyyyMmDd(params.diasRecentes);
  const url = new URL(`${BASE_URL}/licitacoes/v1/licitacoes.json`);
  url.searchParams.set("data_min", dataMin);
  url.searchParams.set("offset", String(params.offset));

  let res: Response;
  try {
    res = await fetchComTimeout(url.toString());
  } catch (erro) {
    throw new Error(
      `ComprasNet não respondeu: ${erro instanceof Error ? erro.message : "erro desconhecido"}`,
    );
  }

  if (res.status === 500) {
    // Instabilidade conhecida e documentada dessa API pública — não
    // é motivo pra derrubar o sync inteiro, só essa fonte extra.
    throw new Error("ComprasNet respondeu 500 (instabilidade conhecida da API pública)");
  }

  if (!res.ok) {
    throw new Error(`ComprasNet respondeu ${res.status}`);
  }

  const json = (await res.json().catch(() => null)) as ComprasNetResposta | ComprasNetLicitacao[] | null;
  if (!json) return [];

  // A API pode responder tanto uma lista direta quanto um objeto
  // HAL com _embedded — tratamos os dois formatos.
  if (Array.isArray(json)) return json;
  return json._embedded?.licitacoes ?? [];
}

/** Extrai um objeto/descrição de forma defensiva (nomes de campo variam). */
export function extrairObjeto(l: ComprasNetLicitacao): string {
  return (l.objeto || l.ds_objeto || "").trim();
}

export function extrairUf(l: ComprasNetLicitacao): string | null {
  return l.uasg?.uf ?? null;
}

export function extrairMunicipio(l: ComprasNetLicitacao): string | null {
  return l.uasg?.municipio ?? null;
}

export function extrairOrgao(l: ComprasNetLicitacao): string {
  return l.uasg?.nome ?? "";
}

export function extrairIdUnico(l: ComprasNetLicitacao): string | null {
  const bruto = l.co_licitacao ?? l.identificador ?? l.numero_aviso;
  return bruto ? `CG-${bruto}` : null;
}

import type { Licitacao, Perfil } from "@/db/schema";

/** Forma mínima de um documento do cofre usada no match. */
export interface DocumentoCofre {
  id: string;
  possui: boolean;
  validade: string | null;
}
import {
  requisitosEstimados,
  type DocumentoPadrao,
} from "@/lib/habilitacao";

/** Fase de participação calculada pelas datas oficiais do PNCP. */
export type Fase = "recebendo" | "aguardando" | "encerrada" | "indefinida";

export interface Avaliacao {
  fase: Fase;
  /** 0–100: o quanto a licitação combina com o perfil + documentos. */
  score: number;
  /** Verde: fase recebendo + todos os documentos estimados em dia. */
  apta: boolean;
  docsExigidos: DocumentoPadrao[];
  docsFaltando: DocumentoPadrao[];
  docsVencidos: DocumentoPadrao[];
  motivos: string[];
  alertas: string[];
}

export function faseDaLicitacao(l: Licitacao, agora = new Date()): Fase {
  const abertura = l.dataAberturaProposta
    ? new Date(l.dataAberturaProposta)
    : null;
  const encerramento = l.dataEncerramentoProposta
    ? new Date(l.dataEncerramentoProposta)
    : null;

  const aberturaValida = abertura && !Number.isNaN(abertura.getTime());
  const encerramentoValido =
    encerramento && !Number.isNaN(encerramento.getTime());

  if (encerramentoValido && encerramento < agora) return "encerrada";
  if (aberturaValida && abertura > agora) return "aguardando";
  if (encerramentoValido) return "recebendo";
  return "indefinida";
}

function parseJsonArray(texto: string): string[] {
  try {
    const v = JSON.parse(texto);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function documentoVencido(d: DocumentoCofre, hojeISO: string): boolean {
  return Boolean(d.possui && d.validade && d.validade < hojeISO);
}

/**
 * Avalia uma licitação contra o perfil e o cofre de documentos.
 *
 * Composição do score (transparente e ajustável):
 *  - 35 pts: categoria está entre as áreas de interesse
 *  - 15 pts: UF está entre as regiões de atuação
 *  - 15 pts: valor dentro da faixa desejada
 *  - 35 pts: cobertura dos documentos estimados (proporcional)
 * Sem perfil preenchido, os critérios correspondentes valem metade
 * (neutro), para o dashboard continuar útil no primeiro acesso.
 */
export function avaliarLicitacao(
  l: Licitacao,
  perfilEmpresa: Perfil | null,
  cofre: DocumentoCofre[],
  agora = new Date(),
): Avaliacao {
  const fase = faseDaLicitacao(l, agora);
  const hojeISO = agora.toISOString().slice(0, 10);

  const docsExigidos = requisitosEstimados(l);
  const porId = new Map(cofre.map((d) => [d.id, d]));

  const docsFaltando: DocumentoPadrao[] = [];
  const docsVencidos: DocumentoPadrao[] = [];

  for (const exigido of docsExigidos) {
    const meu = porId.get(exigido.id);
    if (!meu || !meu.possui) {
      docsFaltando.push(exigido);
    } else if (documentoVencido(meu, hojeISO)) {
      docsVencidos.push(exigido);
    }
  }

  const cobertura =
    docsExigidos.length === 0
      ? 1
      : (docsExigidos.length - docsFaltando.length - docsVencidos.length) /
        docsExigidos.length;

  const categorias = perfilEmpresa ? parseJsonArray(perfilEmpresa.categorias) : [];
  const ufs = perfilEmpresa ? parseJsonArray(perfilEmpresa.ufs) : [];

  const motivos: string[] = [];
  const alertasPerfil: string[] = [];
  let score = 0;

  // Categoria (35) — sem categoria marcada no perfil, não pontua.
  // Um perfil vazio não deve parecer "meio compatível" com tudo.
  if (categorias.length > 0 && categorias.includes(l.categoria)) {
    score += 35;
    motivos.push(`Área de interesse: ${l.categoria}`);
  }

  // UF (15) — mesma lógica: sem região marcada, zero.
  if (ufs.length > 0 && l.uf && ufs.includes(l.uf)) {
    score += 15;
    motivos.push(`Região de atuação: ${l.uf}`);
  }

  // Faixa de valor (15) — mesma lógica: sem faixa definida, zero.
  const valor = l.valorEstimado ?? 0;
  const min = perfilEmpresa?.valorMin ?? null;
  const max = perfilEmpresa?.valorMax ?? null;
  if (min !== null || max !== null) {
    const acimaDoMin = min === null || valor >= min;
    const abaixoDoMax = max === null || (valor > 0 && valor <= max);
    if (acimaDoMin && abaixoDoMax) {
      score += 15;
      motivos.push("Valor dentro da sua faixa");
    }
  }

  // Documentos (35) — já é 100% real: cobertura de verdade do
  // cofre contra os documentos estimados do edital.
  score += Math.round(35 * cobertura);
  if (docsExigidos.length > 0 && docsFaltando.length === 0 && docsVencidos.length === 0) {
    motivos.push("Documentação estimada completa");
  }

  if (categorias.length === 0 && ufs.length === 0 && min === null && max === null) {
    alertasPerfil.push("Perfil incompleto — preencha área, região e faixa de valor para uma aderência real");
  }

  const apta =
    fase === "recebendo" &&
    docsFaltando.length === 0 &&
    docsVencidos.length === 0;

  return {
    fase,
    score: Math.min(100, Math.max(0, score)),
    apta,
    docsExigidos,
    docsFaltando,
    docsVencidos,
    motivos,
    alertas: alertasPerfil,
  };
}

/**
 * Remove registros que são o "mesmo edital" publicado em duplicidade
 * (mesmo órgão + mesmo objeto normalizado). Mantém o primeiro da
 * lista — por isso ordene antes (ex.: encerramento mais próximo).
 */
export function deduplicar(lista: Licitacao[]): Licitacao[] {
  const vistos = new Set<string>();
  const resultado: Licitacao[] = [];

  for (const l of lista) {
    const chave = `${l.cnpjOrgao ?? l.orgao}|${l.objeto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)}`;

    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(l);
  }

  return resultado;
}

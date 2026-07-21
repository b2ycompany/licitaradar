/**
 * Documentos de habilitação (Lei 14.133/2021, arts. 62–70) e a
 * dedução heurística de quais uma licitação tende a exigir.
 *
 * IMPORTANTE: isto é uma ESTIMATIVA para triagem rápida. A lista
 * exata está sempre no edital — a plataforma sinaliza, o edital
 * decide. (Na Fase 2, a extração via IA do PDF do edital substitui
 * a heurística pela lista real.)
 */

export interface DocumentoPadrao {
  id: string;
  nome: string;
  grupo: "Jurídica" | "Fiscal e Trabalhista" | "Econômico-financeira" | "Técnica";
}

export const DOCUMENTOS_PADRAO: DocumentoPadrao[] = [
  // Habilitação jurídica
  { id: "contrato_social", nome: "Contrato social / ato constitutivo consolidado", grupo: "Jurídica" },
  { id: "doc_representante", nome: "Documento do representante legal (RG/CNH)", grupo: "Jurídica" },
  { id: "procuracao", nome: "Procuração (se assinada por procurador)", grupo: "Jurídica" },

  // Regularidade fiscal e trabalhista
  { id: "cnd_federal", nome: "CND Federal (Receita/PGFN)", grupo: "Fiscal e Trabalhista" },
  { id: "cnd_estadual", nome: "CND Estadual", grupo: "Fiscal e Trabalhista" },
  { id: "cnd_municipal", nome: "CND Municipal", grupo: "Fiscal e Trabalhista" },
  { id: "crf_fgts", nome: "CRF do FGTS (Caixa)", grupo: "Fiscal e Trabalhista" },
  { id: "cndt", nome: "CNDT — Certidão Negativa de Débitos Trabalhistas", grupo: "Fiscal e Trabalhista" },

  // Qualificação econômico-financeira
  { id: "balanco", nome: "Balanço patrimonial do último exercício", grupo: "Econômico-financeira" },
  { id: "certidao_falencia", nome: "Certidão negativa de falência/recuperação", grupo: "Econômico-financeira" },

  // Qualificação técnica
  { id: "atestado_tecnico", nome: "Atestado(s) de capacidade técnica", grupo: "Técnica" },
  { id: "registro_conselho", nome: "Registro no conselho profissional (CREA/CAU etc.)", grupo: "Técnica" },
  { id: "licenca_sanitaria", nome: "Licença/alvará sanitário", grupo: "Técnica" },
];

const POR_ID = new Map(DOCUMENTOS_PADRAO.map((d) => [d.id, d]));

export function documentoPorId(id: string): DocumentoPadrao | undefined {
  return POR_ID.get(id);
}

/** Valor a partir do qual assumimos exigência econômico-financeira. */
const LIMIAR_QUALIFICACAO_ECONOMICA = 300_000;

/** Categorias que costumam exigir atestado de capacidade técnica. */
const CATEGORIAS_COM_ATESTADO = new Set([
  "Tecnologia",
  "Engenharia e Obras",
  "Consultoria e Serviços Técnicos",
  "Facilities e Limpeza",
  "Saúde",
]);

/**
 * Deduz os documentos que a licitação tende a exigir, a partir de
 * categoria e valor estimado.
 */
export function requisitosEstimados(l: {
  categoria: string;
  valorEstimado: number | null;
}): DocumentoPadrao[] {
  const ids = new Set<string>([
    "contrato_social",
    "doc_representante",
    "cnd_federal",
    "cnd_estadual",
    "cnd_municipal",
    "crf_fgts",
    "cndt",
  ]);

  const valor = l.valorEstimado ?? 0;
  if (valor >= LIMIAR_QUALIFICACAO_ECONOMICA) {
    ids.add("balanco");
    ids.add("certidao_falencia");
  }

  if (CATEGORIAS_COM_ATESTADO.has(l.categoria)) {
    ids.add("atestado_tecnico");
  }

  if (l.categoria === "Engenharia e Obras") {
    ids.add("registro_conselho");
  }

  if (l.categoria === "Saúde" || l.categoria === "Alimentação") {
    ids.add("licenca_sanitaria");
  }

  return [...ids]
    .map((id) => POR_ID.get(id))
    .filter((d): d is DocumentoPadrao => Boolean(d));
}

import {
  pgTable,
  text,
  doublePrecision,
  integer,
  boolean,
  customType,
} from "drizzle-orm/pg-core";

/** Tipo binário do Postgres para armazenar os arquivos (bytea). */
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Tabela principal: cada linha é uma contratação publicada no PNCP.
 * O id é o numeroControlePNCP (identificador oficial e único).
 * `status` é o pipeline de acompanhamento do usuário:
 * nova | analisando | preparando | inscrita | em_disputa | ganha | perdida
 */
export const licitacoes = pgTable("licitacoes", {
  id: text("id").primaryKey(),
  fonte: text("fonte").notNull().default("pncp"), // "pncp" | "comprasnet"
  objeto: text("objeto").notNull(),
  orgao: text("orgao").notNull().default(""),
  cnpjOrgao: text("cnpj_orgao"),
  unidade: text("unidade"),
  municipio: text("municipio"),
  uf: text("uf"),
  esfera: text("esfera"),
  modalidadeId: integer("modalidade_id"),
  modalidadeNome: text("modalidade_nome"),
  situacao: text("situacao"),
  valorEstimado: doublePrecision("valor_estimado"),
  dataPublicacao: text("data_publicacao"),
  dataAberturaProposta: text("data_abertura_proposta"),
  dataEncerramentoProposta: text("data_encerramento_proposta"),
  anoCompra: integer("ano_compra"),
  sequencialCompra: integer("sequencial_compra"),
  srp: boolean("srp").notNull().default(false),
  linkOrigem: text("link_origem"),
  categoria: text("categoria").notNull().default("Outros"),
  favorita: boolean("favorita").notNull().default(false),
  status: text("status").notNull().default("nova"),
  criadoEm: text("criado_em").notNull(),
  atualizadoEm: text("atualizado_em").notNull(),
});

/**
 * Perfil da empresa (MVP mono-usuário: uma linha com id "empresa").
 * ufs e categorias são arrays JSON serializados em texto.
 */
export const perfil = pgTable("perfil", {
  id: text("id").primaryKey(),
  nomeEmpresa: text("nome_empresa").notNull().default(""),
  ufs: text("ufs").notNull().default("[]"),
  categorias: text("categorias").notNull().default("[]"),
  valorMin: doublePrecision("valor_min"),
  valorMax: doublePrecision("valor_max"),
  ultimoSyncEm: text("ultimo_sync_em"),
  syncEmAndamentoDesde: text("sync_em_andamento_desde"),
  atualizadoEm: text("atualizado_em").notNull(),
});

/**
 * Cofre de documentos de habilitação da empresa, agora com o
 * arquivo (PDF/imagem) armazenado no banco.
 *
 * Nota de escala: guardar bytea no Postgres é adequado para o
 * volume de uma empresa (certidões são pequenas). Quando a
 * plataforma virar multiempresa, o arquivo migra para o Supabase
 * Storage e esta coluna vira só a referência.
 */
export const documentos = pgTable("documentos", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  grupo: text("grupo").notNull(),
  possui: boolean("possui").notNull().default(false),
  validade: text("validade"),
  arquivo: bytea("arquivo"),
  arquivoNome: text("arquivo_nome"),
  arquivoTipo: text("arquivo_tipo"),
  arquivoTamanho: integer("arquivo_tamanho"),
  atualizadoEm: text("atualizado_em").notNull(),
});

export type Licitacao = typeof licitacoes.$inferSelect;
export type NovaLicitacao = typeof licitacoes.$inferInsert;
export type Perfil = typeof perfil.$inferSelect;
export type Documento = typeof documentos.$inferSelect;

/**
 * Usuários da plataforma. `id` é o mesmo UUID do Supabase Auth
 * (auth.users.id) — a senha em si fica só no Supabase Auth, aqui
 * guardamos só o controle de acesso (aprovado/pendente, admin ou
 * não).
 */
export const usuarios = pgTable("usuarios", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  status: text("status").notNull().default("pendente"), // pendente | aprovado | rejeitado
  isAdmin: boolean("is_admin").notNull().default(false),
  criadoEm: text("criado_em").notNull(),
  aprovadoEm: text("aprovado_em"),
  aprovadoPorEmail: text("aprovado_por_email"),
});

export type Usuario = typeof usuarios.$inferSelect;
export type NovoUsuario = typeof usuarios.$inferInsert;

/**
 * Histórico de contratos firmados (dados oficiais do PNCP,
 * endpoint /v1/contratos) — é aqui que aparece QUEM ganhou: nome
 * e CNPJ do fornecedor, valor e categoria. Base da inteligência
 * competitiva: "quem costuma vencer neste órgão/categoria".
 */
export const contratosVencedores = pgTable("contratos_vencedores", {
  id: text("id").primaryKey(), // numeroControlePNCP do contrato
  numeroControlePNCPCompra: text("numero_controle_pncp_compra"),
  cnpjOrgao: text("cnpj_orgao").notNull(),
  orgao: text("orgao").notNull().default(""),
  uf: text("uf"),
  municipio: text("municipio"),
  categoriaProcesso: text("categoria_processo"), // taxonomia própria do PNCP
  categoria: text("categoria").notNull().default("Outros"), // nossa taxonomia (categorize.ts)
  objeto: text("objeto").notNull().default(""),
  fornecedorCnpj: text("fornecedor_cnpj"),
  fornecedorNome: text("fornecedor_nome").notNull().default(""),
  valorInicial: doublePrecision("valor_inicial"),
  valorGlobal: doublePrecision("valor_global"),
  dataAssinatura: text("data_assinatura"),
  criadoEm: text("criado_em").notNull(),
});

export type ContratoVencedor = typeof contratosVencedores.$inferSelect;
export type NovoContratoVencedor = typeof contratosVencedores.$inferInsert;

/**
 * Versão do documento sem o binário — é o que circula entre
 * servidor e componentes (o arquivo em si só trafega nas rotas
 * de upload/download).
 */
export type DocumentoMeta = Omit<Documento, "arquivo">;

/** Colunas do documento sem o binário, para selects leves. */
export const colunasDocumentoMeta = {
  id: documentos.id,
  nome: documentos.nome,
  grupo: documentos.grupo,
  possui: documentos.possui,
  validade: documentos.validade,
  arquivoNome: documentos.arquivoNome,
  arquivoTipo: documentos.arquivoTipo,
  arquivoTamanho: documentos.arquivoTamanho,
  atualizadoEm: documentos.atualizadoEm,
};

/** Pipeline de acompanhamento de uma licitação. */
export const STATUS_PIPELINE = [
  { valor: "nova", rotulo: "Sem acompanhamento" },
  { valor: "analisando", rotulo: "Analisando" },
  { valor: "preparando", rotulo: "Preparando documentos" },
  { valor: "inscrita", rotulo: "Inscrita / proposta enviada" },
  { valor: "em_disputa", rotulo: "Em disputa (lances)" },
  { valor: "ganha", rotulo: "Ganha 🏆" },
  { valor: "perdida", rotulo: "Perdida" },
] as const;

export type StatusPipeline = (typeof STATUS_PIPELINE)[number]["valor"];

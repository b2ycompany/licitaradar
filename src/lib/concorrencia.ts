import type { ContratoVencedor, Perfil } from "@/db/schema";

export interface EstatisticasOrgao {
  totalContratos: number;
  fornecedoresDistintos: number;
  valorMedio: number;
  valorMinimo: number;
  valorMaximo: number;
  /** Top fornecedores por número de contratos, decrescente. */
  rankingFornecedores: { nome: string; cnpj: string | null; contratos: number; valorTotal: number }[];
  categorias: string[];
}

export function calcularEstatisticas(contratos: ContratoVencedor[]): EstatisticasOrgao {
  const porFornecedor = new Map<
    string,
    { nome: string; cnpj: string | null; contratos: number; valorTotal: number }
  >();

  let somaValores = 0;
  let valoresValidos = 0;
  let valorMinimo = Infinity;
  let valorMaximo = 0;
  const categorias = new Set<string>();

  for (const c of contratos) {
    const valor = c.valorGlobal ?? c.valorInicial ?? 0;
    if (valor > 0) {
      somaValores += valor;
      valoresValidos++;
      if (valor < valorMinimo) valorMinimo = valor;
      if (valor > valorMaximo) valorMaximo = valor;
    }
    if (c.categoria) categorias.add(c.categoria);

    const chave = c.fornecedorCnpj || c.fornecedorNome;
    const atual = porFornecedor.get(chave) ?? {
      nome: c.fornecedorNome,
      cnpj: c.fornecedorCnpj,
      contratos: 0,
      valorTotal: 0,
    };
    atual.contratos++;
    atual.valorTotal += valor;
    porFornecedor.set(chave, atual);
  }

  const rankingFornecedores = [...porFornecedor.values()].sort(
    (a, b) => b.contratos - a.contratos,
  );

  return {
    totalContratos: contratos.length,
    fornecedoresDistintos: porFornecedor.size,
    valorMedio: valoresValidos > 0 ? somaValores / valoresValidos : 0,
    valorMinimo: Number.isFinite(valorMinimo) ? valorMinimo : 0,
    valorMaximo,
    rankingFornecedores,
    categorias: [...categorias],
  };
}

export interface IndiceCompetitividade {
  indice: number; // 0-100
  motivos: string[];
  alertas: string[];
}

/**
 * Índice de Competitividade (0-100) — uma ESTIMATIVA, não uma
 * previsão. Combina sinais públicos disponíveis:
 *
 *  - 40 pts: concentração de mercado (quantos fornecedores
 *    diferentes já venceram ali — poucos = mercado fechado,
 *    muitos = mais espaço para novo entrante)
 *  - 30 pts: aderência de categoria (o órgão compra no que você
 *    atua?)
 *  - 30 pts: aderência de valor (o ticket histórico está dentro
 *    da sua faixa?)
 *
 * NUNCA deve ser lido como garantia de vitória — é um retrato de
 * quão favorável é o terreno, com base em dados públicos.
 */
export function calcularIndiceCompetitividade(
  stats: EstatisticasOrgao,
  perfilEmpresa: Perfil | null,
): IndiceCompetitividade {
  const motivos: string[] = [];
  const alertas: string[] = [];
  let indice = 0;

  if (stats.totalContratos === 0) {
    return {
      indice: 0,
      motivos: [],
      alertas: ["Sem histórico de contratos suficiente para este órgão ainda."],
    };
  }

  // Concentração de mercado (40 pts)
  const razaoFornecedores = stats.fornecedoresDistintos / stats.totalContratos;
  if (razaoFornecedores >= 0.6) {
    indice += 40;
    motivos.push(
      `Mercado pulverizado: ${stats.fornecedoresDistintos} fornecedores diferentes já venceram aqui`,
    );
  } else if (razaoFornecedores >= 0.3) {
    indice += 24;
    motivos.push(`Concorrência moderada: ${stats.fornecedoresDistintos} fornecedores distintos`);
  } else {
    indice += 8;
    alertas.push(
      `Mercado concentrado: poucos fornecedores (${stats.fornecedoresDistintos}) dominam as contratações deste órgão`,
    );
  }

  if (stats.rankingFornecedores[0] && stats.totalContratos >= 3) {
    const participacaoLider = stats.rankingFornecedores[0].contratos / stats.totalContratos;
    if (participacaoLider >= 0.5) {
      alertas.push(
        `${stats.rankingFornecedores[0].nome} venceu ${Math.round(participacaoLider * 100)}% dos contratos analisados`,
      );
    }
  }

  // Aderência de categoria (30 pts)
  const categoriasPerfil: string[] = perfilEmpresa?.categorias
    ? JSON.parse(perfilEmpresa.categorias)
    : [];
  const categoriaBate =
    categoriasPerfil.length === 0 ||
    stats.categorias.some((c) => categoriasPerfil.includes(c));
  if (categoriaBate && categoriasPerfil.length > 0) {
    indice += 30;
    motivos.push("Este órgão contrata na sua área de interesse");
  } else if (categoriasPerfil.length === 0) {
    indice += 15;
  } else {
    alertas.push("Categoria histórica deste órgão não bate com suas áreas de interesse");
  }

  // Aderência de valor (30 pts)
  const min = perfilEmpresa?.valorMin ?? null;
  const max = perfilEmpresa?.valorMax ?? null;
  if (min === null && max === null) {
    indice += 15;
  } else {
    const acimaDoMin = min === null || stats.valorMedio >= min;
    const abaixoDoMax = max === null || stats.valorMedio <= max;
    if (acimaDoMin && abaixoDoMax) {
      indice += 30;
      motivos.push("Ticket médio histórico dentro da sua faixa de valor");
    } else {
      alertas.push("Ticket médio histórico fora da sua faixa de valor cadastrada");
    }
  }

  return { indice: Math.min(100, Math.round(indice)), motivos, alertas };
}

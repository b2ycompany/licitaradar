/**
 * Categorização do objeto da licitação por palavras-chave.
 *
 * Estratégia MVP: regras determinísticas (rápidas, gratuitas e
 * auditáveis). A categoria com mais palavras-chave encontradas
 * no objeto vence. Evolução natural: classificação via LLM ou
 * embeddings para os casos que caírem em "Outros".
 */

const REGRAS: { categoria: string; termos: string[] }[] = [
  {
    categoria: "Tecnologia",
    termos: [
      "software",
      "sistema",
      "informatica",
      "tecnologia da informacao",
      " ti ",
      "computador",
      "notebook",
      "servidor de rede",
      "datacenter",
      "licenca de uso",
      "desenvolvimento de sistema",
      "aplicativo",
      "rede de dados",
      "telecomunicac",
      "internet",
      "impressora",
      "outsourcing de impressao",
      "seguranca da informacao",
      "nuvem",
      "hospedagem",
    ],
  },
  {
    categoria: "Engenharia e Obras",
    termos: [
      "obra",
      "engenharia",
      "construcao",
      "reforma",
      "pavimentacao",
      "drenagem",
      "edificacao",
      "terraplenagem",
      "ponte",
      "saneamento",
      "esgoto",
      "abastecimento de agua",
      "projeto executivo",
      "projeto basico",
      "manutencao predial",
      "eletrica predial",
      "iluminacao publica",
    ],
  },
  {
    categoria: "Saúde",
    termos: [
      "medicamento",
      "hospitalar",
      "saude",
      "medico",
      "enfermagem",
      "odontolog",
      "laboratorio de analises",
      "insumo farmaceutico",
      "equipamento medico",
      "ambulancia",
      "vacina",
      "correlatos",
    ],
  },
  {
    categoria: "Educação",
    termos: [
      "escolar",
      "educacao",
      "ensino",
      "didatico",
      "merenda",
      "creche",
      "universidade",
      "capacitacao",
      "treinamento",
      "curso",
    ],
  },
  {
    categoria: "Alimentação",
    termos: [
      "genero alimenticio",
      "generos alimenticios",
      "alimentacao",
      "refeicao",
      "coffee break",
      "cesta basica",
      "agricultura familiar",
      "hortifruti",
    ],
  },
  {
    categoria: "Veículos e Transporte",
    termos: [
      "veiculo",
      "transporte",
      "combustivel",
      "pneu",
      "onibus",
      "caminhao",
      "locacao de veiculos",
      "manutencao de frota",
      "pecas automotivas",
    ],
  },
  {
    categoria: "Facilities e Limpeza",
    termos: [
      "limpeza",
      "conservacao",
      "vigilancia",
      "seguranca patrimonial",
      "portaria",
      "recepcao",
      "jardinagem",
      "copeiragem",
      "material de limpeza",
      "dedetizacao",
      "coleta de residuos",
    ],
  },
  {
    categoria: "Móveis e Equipamentos",
    termos: [
      "mobiliario",
      "moveis",
      "cadeira",
      "armario",
      "eletrodomestico",
      "ar condicionado",
      "equipamento",
      "utensilios",
      "ferramentas",
    ],
  },
  {
    categoria: "Consultoria e Serviços Técnicos",
    termos: [
      "consultoria",
      "assessoria",
      "auditoria",
      "pericia",
      "servicos tecnicos especializados",
      "engenharia consultiva",
      "estudo tecnico",
      "publicidade",
      "comunicacao institucional",
    ],
  },
];

/** Remove acentos e normaliza para comparação. */
function normalizar(texto: string): string {
  return ` ${texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")} `;
}

export function categorizar(objeto: string): string {
  const texto = normalizar(objeto);

  let melhor = "Outros";
  let melhorPontuacao = 0;

  for (const regra of REGRAS) {
    let pontos = 0;
    for (const termo of regra.termos) {
      if (texto.includes(termo)) pontos++;
    }
    if (pontos > melhorPontuacao) {
      melhorPontuacao = pontos;
      melhor = regra.categoria;
    }
  }

  return melhor;
}

export const CATEGORIAS = [...REGRAS.map((r) => r.categoria), "Outros"];

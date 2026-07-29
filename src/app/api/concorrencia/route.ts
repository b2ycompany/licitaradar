import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { contratosVencedores, type NovoContratoVencedor } from "@/db/schema";
import { buscarContratosPorPeriodo, type PncpContrato } from "@/lib/pncp";
import { categorizar } from "@/lib/categorize";
import { medirFim, medirInicio } from "@/lib/perf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function mapear(c: PncpContrato, agora: string): NovoContratoVencedor | null {
  if (!c.numeroControlePNCP || !c.orgaoEntidade?.cnpj) return null;

  return {
    id: c.numeroControlePNCP,
    numeroControlePNCPCompra: c.numeroControlePNCPCompra ?? null,
    cnpjOrgao: c.orgaoEntidade.cnpj,
    orgao: c.orgaoEntidade.razaoSocial ?? "",
    uf: c.unidadeOrgao?.ufSigla ?? null,
    municipio: c.unidadeOrgao?.municipioNome ?? null,
    categoriaProcesso: c.categoriaProcesso?.nome ?? null,
    categoria: categorizar(c.objetoContrato ?? ""),
    objeto: c.objetoContrato?.trim() || "(sem descrição)",
    fornecedorCnpj: c.niFornecedor ?? null,
    fornecedorNome: c.nomeRazaoSocialFornecedor ?? "(não informado)",
    valorInicial: c.valorInicial ?? null,
    valorGlobal: c.valorGlobal ?? null,
    dataAssinatura: c.dataAssinatura ?? null,
    criadoEm: agora,
  };
}

/** yyyyMMdd de N anos atrás. */
function anosAtrasAAAAMMDD(anos: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - anos);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}${mm}${dd}`;
}

/**
 * POST /api/concorrencia  { "cnpjOrgao": "..." }
 * Busca sob demanda o histórico de contratos (últimos 2 anos) de
 * UM órgão específico — não faz varredura nacional (evitaria o
 * rate limit do PNCP e não é o que a análise precisa: o que
 * importa é o histórico do órgão que a licitação pertence).
 */
export async function POST(req: Request) {
  const inicioTotal = medirInicio();
  const corpo = (await req.json().catch(() => null)) as { cnpjOrgao?: string } | null;

  if (!corpo?.cnpjOrgao) {
    return NextResponse.json(
      { ok: false, erro: "Informe o cnpjOrgao." },
      { status: 400 },
    );
  }

  const dataInicial = anosAtrasAAAAMMDD(2);
  const dataFinal = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
  const agora = new Date().toISOString();

  let pagina = 1;
  let totalPaginas = 1;
  let importados = 0;

  try {
    do {
      const resposta = await buscarContratosPorPeriodo({
        dataInicial,
        dataFinal,
        pagina,
        cnpjOrgao: corpo.cnpjOrgao,
      });
      totalPaginas = resposta.totalPaginas;

      const valores = resposta.data
        .map((c) => mapear(c, agora))
        .filter((v): v is NovoContratoVencedor => v !== null);

      if (valores.length > 0) {
        await db
          .insert(contratosVencedores)
          .values(valores)
          .onConflictDoUpdate({
            target: contratosVencedores.id,
            set: {
              fornecedorNome: sql.raw(`excluded."fornecedor_nome"`),
              fornecedorCnpj: sql.raw(`excluded."fornecedor_cnpj"`),
              valorInicial: sql.raw(`excluded."valor_inicial"`),
              valorGlobal: sql.raw(`excluded."valor_global"`),
              categoria: sql.raw(`excluded."categoria"`),
              categoriaProcesso: sql.raw(`excluded."categoria_processo"`),
            },
          });
        importados += valores.length;
      }

      pagina++;
    } while (pagina <= totalPaginas && pagina <= 10);

    medirFim(inicioTotal, `concorrencia: TOTAL (${importados} contratos)`);

    return NextResponse.json({ ok: true, importados });
  } catch (erro) {
    console.error("Erro ao buscar histórico de contratos:", erro);
    return NextResponse.json(
      {
        ok: false,
        erro: erro instanceof Error ? erro.message : "Erro desconhecido",
      },
      { status: 502 },
    );
  }
}

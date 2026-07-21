import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { colunasDocumentoMeta, documentos, perfil } from "@/db/schema";
import { DOCUMENTOS_PADRAO } from "@/lib/habilitacao";
import { garantirSeed, PERFIL_ID } from "@/lib/seed";

export const dynamic = "force-dynamic";

/** GET /api/perfil — devolve perfil + cofre de documentos. */
export async function GET() {
  await garantirSeed();

  const [dadosPerfil] = await db.select().from(perfil).limit(1);
  const cofre = await db.select(colunasDocumentoMeta).from(documentos);

  return NextResponse.json({ ok: true, perfil: dadosPerfil, documentos: cofre });
}

interface CorpoPerfil {
  nomeEmpresa?: string;
  ufs?: string[];
  categorias?: string[];
  valorMin?: number | null;
  valorMax?: number | null;
  documentos?: { id: string; possui: boolean; validade: string | null }[];
}

/** POST /api/perfil — salva perfil e documentos de uma vez. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as CorpoPerfil | null;

  if (!corpo) {
    return NextResponse.json(
      { ok: false, erro: "Corpo inválido." },
      { status: 400 },
    );
  }

  await garantirSeed();
  const agora = new Date().toISOString();

  await db
    .update(perfil)
    .set({
      nomeEmpresa: (corpo.nomeEmpresa ?? "").slice(0, 200),
      ufs: JSON.stringify(corpo.ufs ?? []),
      categorias: JSON.stringify(corpo.categorias ?? []),
      valorMin: corpo.valorMin ?? null,
      valorMax: corpo.valorMax ?? null,
      atualizadoEm: agora,
    })
    .where(sql`${perfil.id} = ${PERFIL_ID}`);

  const idsValidos = new Set(DOCUMENTOS_PADRAO.map((d) => d.id));
  for (const doc of corpo.documentos ?? []) {
    if (!idsValidos.has(doc.id)) continue;
    await db
      .update(documentos)
      .set({
        possui: Boolean(doc.possui),
        validade: doc.validade || null,
        atualizadoEm: agora,
      })
      .where(sql`${documentos.id} = ${doc.id}`);
  }

  return NextResponse.json({ ok: true });
}

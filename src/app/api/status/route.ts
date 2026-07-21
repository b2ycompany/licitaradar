import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { licitacoes, STATUS_PIPELINE } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * POST /api/status  { "id": "...", "status": "inscrita" }
 * Move a licitação no pipeline de acompanhamento.
 */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as {
    id?: string;
    status?: string;
  } | null;

  const valido = STATUS_PIPELINE.some((s) => s.valor === corpo?.status);
  if (!corpo?.id || !corpo.status || !valido) {
    return NextResponse.json(
      { ok: false, erro: "Informe id e um status válido." },
      { status: 400 },
    );
  }

  const resultado = await db
    .update(licitacoes)
    .set({ status: corpo.status, atualizadoEm: new Date().toISOString() })
    .where(eq(licitacoes.id, corpo.id))
    .returning({ id: licitacoes.id });

  if (resultado.length === 0) {
    return NextResponse.json(
      { ok: false, erro: "Licitação não encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, status: corpo.status });
}

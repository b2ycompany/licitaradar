import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { licitacoes } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * POST /api/favoritas  { "id": "numeroControlePNCP" }
 * Alterna o estado de favorita da licitação.
 */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { id?: string } | null;

  if (!corpo?.id) {
    return NextResponse.json(
      { ok: false, erro: "Informe o id da licitação." },
      { status: 400 },
    );
  }

  const [atual] = await db
    .select({ favorita: licitacoes.favorita })
    .from(licitacoes)
    .where(eq(licitacoes.id, corpo.id))
    .limit(1);

  if (!atual) {
    return NextResponse.json(
      { ok: false, erro: "Licitação não encontrada." },
      { status: 404 },
    );
  }

  const novoValor = !atual.favorita;

  await db
    .update(licitacoes)
    .set({ favorita: novoValor, atualizadoEm: new Date().toISOString() })
    .where(eq(licitacoes.id, corpo.id));

  return NextResponse.json({ ok: true, favorita: novoValor });
}

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documentos } from "@/db/schema";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

/** GET /api/documentos/:id/arquivo — abre o arquivo salvo. */
export async function GET(_req: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  const [doc] = await db
    .select({
      arquivo: documentos.arquivo,
      arquivoNome: documentos.arquivoNome,
      arquivoTipo: documentos.arquivoTipo,
    })
    .from(documentos)
    .where(eq(documentos.id, id))
    .limit(1);

  if (!doc?.arquivo) {
    return NextResponse.json(
      { ok: false, erro: "Documento sem arquivo." },
      { status: 404 },
    );
  }

  return new Response(new Uint8Array(doc.arquivo), {
    headers: {
      "Content-Type": doc.arquivoTipo ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.arquivoNome ?? id)}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** DELETE /api/documentos/:id/arquivo — remove só o arquivo. */
export async function DELETE(_req: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  await db
    .update(documentos)
    .set({
      arquivo: null,
      arquivoNome: null,
      arquivoTipo: null,
      arquivoTamanho: null,
      atualizadoEm: new Date().toISOString(),
    })
    .where(eq(documentos.id, id));

  return NextResponse.json({ ok: true });
}

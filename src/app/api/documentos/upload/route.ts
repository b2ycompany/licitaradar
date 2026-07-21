import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documentos } from "@/db/schema";
import { DOCUMENTOS_PADRAO } from "@/lib/habilitacao";
import { garantirSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

const TAMANHO_MAXIMO = 8 * 1024 * 1024; // 8 MB
const TIPOS_ACEITOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

/**
 * POST /api/documentos/upload
 * FormData: id (código do documento) + arquivo (PDF/JPG/PNG).
 * Salva o arquivo no cofre e marca o documento como "possui".
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { ok: false, erro: "Envie um formulário multipart." },
      { status: 400 },
    );
  }

  const id = String(form.get("id") ?? "");
  const arquivo = form.get("arquivo");

  const idsValidos = new Set(DOCUMENTOS_PADRAO.map((d) => d.id));
  if (!idsValidos.has(id)) {
    return NextResponse.json(
      { ok: false, erro: "Documento desconhecido." },
      { status: 400 },
    );
  }

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json(
      { ok: false, erro: "Anexe um arquivo." },
      { status: 400 },
    );
  }

  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json(
      { ok: false, erro: "Arquivo acima de 8 MB." },
      { status: 413 },
    );
  }

  if (!TIPOS_ACEITOS.has(arquivo.type)) {
    return NextResponse.json(
      { ok: false, erro: "Formato aceito: PDF, JPG ou PNG." },
      { status: 415 },
    );
  }

  await garantirSeed();

  const conteudo = Buffer.from(await arquivo.arrayBuffer());

  await db
    .update(documentos)
    .set({
      arquivo: conteudo,
      arquivoNome: arquivo.name.slice(0, 200),
      arquivoTipo: arquivo.type,
      arquivoTamanho: arquivo.size,
      possui: true,
      atualizadoEm: new Date().toISOString(),
    })
    .where(eq(documentos.id, id));

  return NextResponse.json({
    ok: true,
    arquivoNome: arquivo.name,
    arquivoTamanho: arquivo.size,
  });
}

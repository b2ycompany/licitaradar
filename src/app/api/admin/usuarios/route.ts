import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { exigirAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/usuarios  { id, acao }
 * acao: "aprovar" | "rejeitar" | "tornar_admin" | "remover_admin"
 * Só quem já é admin aprovado pode chamar isso — exigirAdmin()
 * barra e redireciona qualquer outro caso antes de chegar aqui.
 */
export async function POST(req: Request) {
  const atual = await exigirAdmin();

  const corpo = (await req.json().catch(() => null)) as { id?: string; acao?: string } | null;
  if (!corpo?.id || !corpo.acao) {
    return NextResponse.json({ ok: false, erro: "Informe id e acao." }, { status: 400 });
  }

  const agora = new Date().toISOString();

  if (corpo.acao === "aprovar") {
    await db
      .update(usuarios)
      .set({ status: "aprovado", aprovadoEm: agora, aprovadoPorEmail: atual.email })
      .where(eq(usuarios.id, corpo.id));
  } else if (corpo.acao === "rejeitar") {
    await db
      .update(usuarios)
      .set({ status: "rejeitado", aprovadoEm: agora, aprovadoPorEmail: atual.email })
      .where(eq(usuarios.id, corpo.id));
  } else if (corpo.acao === "tornar_admin") {
    await db.update(usuarios).set({ isAdmin: true }).where(eq(usuarios.id, corpo.id));
  } else if (corpo.acao === "remover_admin") {
    // Nunca deixa o próprio admin se remover sozinho e ficar todo
    // mundo sem admin nenhum por acidente.
    if (corpo.id === atual.usuario.id) {
      return NextResponse.json(
        { ok: false, erro: "Você não pode remover seu próprio acesso de admin." },
        { status: 400 },
      );
    }
    await db.update(usuarios).set({ isAdmin: false }).where(eq(usuarios.id, corpo.id));
  } else {
    return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

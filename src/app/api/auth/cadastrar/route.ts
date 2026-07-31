import { NextResponse } from "next/server";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/cadastrar  { email, senha }
 * Cria o usuário no Supabase Auth e registra o controle de acesso.
 * Se o e-mail bater com ADMIN_EMAIL_INICIAL, já entra aprovado e
 * como admin — é assim que o primeiro administrador é criado, sem
 * precisar mexer direto no banco.
 */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { email?: string; senha?: string } | null;

  if (!corpo?.email || !corpo.senha) {
    return NextResponse.json({ ok: false, erro: "Informe e-mail e senha." }, { status: 400 });
  }

  if (corpo.senha.length < 8) {
    return NextResponse.json(
      { ok: false, erro: "A senha precisa ter pelo menos 8 caracteres." },
      { status: 400 },
    );
  }

  try {
    const supabase = await criarClienteSupabaseServidor();
    const { data, error } = await supabase.auth.signUp({
      email: corpo.email,
      password: corpo.senha,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { ok: false, erro: error?.message ?? "Não foi possível criar a conta." },
        { status: 400 },
      );
    }

    const emailAdminInicial = process.env.ADMIN_EMAIL_INICIAL?.toLowerCase().trim();
    const ehAdminInicial =
      !!emailAdminInicial && corpo.email.toLowerCase().trim() === emailAdminInicial;

    const agora = new Date().toISOString();

    await db
      .insert(usuarios)
      .values({
        id: data.user.id,
        email: corpo.email,
        status: ehAdminInicial ? "aprovado" : "pendente",
        isAdmin: ehAdminInicial,
        criadoEm: agora,
        aprovadoEm: ehAdminInicial ? agora : null,
        aprovadoPorEmail: ehAdminInicial ? "sistema (admin inicial)" : null,
      })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true, aprovadoDeImediato: ehAdminInicial });
  } catch (erro) {
    // Antes, um erro aqui (ex.: variável de ambiente do Supabase
    // ausente/errada) derrubava a rota sem corpo JSON — o fetch do
    // navegador via isso como "falha de conexão" genérica, escondendo
    // a causa real. Agora sempre volta um JSON com o motivo.
    console.error("[erro] /api/auth/cadastrar:", erro);
    return NextResponse.json(
      {
        ok: false,
        erro: erro instanceof Error ? `Erro interno: ${erro.message}` : "Erro interno desconhecido",
      },
      { status: 500 },
    );
  }
}

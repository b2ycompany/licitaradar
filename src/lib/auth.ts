import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios, type Usuario } from "@/db/schema";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

/**
 * Busca o usuário logado (Supabase Auth) + o registro de controle
 * de acesso dele na nossa tabela `usuarios`. Não redireciona —
 * quem chama decide o que fazer com o resultado.
 */
export async function obterUsuarioAtual(): Promise<{
  email: string;
  usuario: Usuario | null;
} | null> {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return null;

  const [linha] = await db.select().from(usuarios).where(eq(usuarios.id, user.id)).limit(1);

  return { email: user.email, usuario: linha ?? null };
}

/**
 * Usar no topo de qualquer página que exige estar logado E
 * aprovado. Redireciona sozinho se alguma condição não bater.
 */
export async function exigirUsuarioAprovado(): Promise<{ email: string; usuario: Usuario }> {
  const atual = await obterUsuarioAtual();

  if (!atual) redirect("/login");
  if (!atual.usuario || atual.usuario.status !== "aprovado") redirect("/aguardando-aprovacao");

  return { email: atual.email, usuario: atual.usuario };
}

/** Igual à anterior, mas também exige que o usuário seja admin. */
export async function exigirAdmin(): Promise<{ email: string; usuario: Usuario }> {
  const atual = await exigirUsuarioAprovado();
  if (!atual.usuario.isAdmin) redirect("/");
  return atual;
}

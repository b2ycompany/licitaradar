import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente do Supabase Auth para uso em Server Components, Route
 * Handlers e Server Actions — lê/escreve a sessão através dos
 * cookies da requisição.
 */
export async function criarClienteSupabaseServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesParaDefinir: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesParaDefinir.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de dentro de um Server Component (não pode
            // escrever cookie) — o middleware já cuida de renovar a
            // sessão nesses casos, então é seguro ignorar aqui.
          }
        },
      },
    },
  );
}

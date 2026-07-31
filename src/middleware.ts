import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

/**
 * Duas responsabilidades:
 *
 * 1) Renova a sessão do Supabase Auth a cada request (padrão
 *    recomendado pelo Supabase para App Router) e redireciona para
 *    /login quem não está autenticado.
 * 2) Força "não cachear nada" em toda resposta — diagnóstico
 *    confirmado anteriormente: em produção na Vercel, uma camada de
 *    cache intermediária servia a mesma página ignorando a query
 *    string. Isso garante que nunca mais aconteça.
 *
 * O status "aprovado/pendente" e "é admin" NÃO é checado aqui —​
 * middleware roda no Edge Runtime, que não suporta a conexão direta
 * com o Postgres que usamos (Drizzle/postgres.js precisam do Node).
 * Essa checagem fica em src/lib/auth.ts, chamada dentro de cada
 * página (que já roda em Node.js normalmente).
 */
const ROTAS_PUBLICAS = ["/login", "/cadastro"];

export async function middleware(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesParaDefinir: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesParaDefinir.forEach(({ name, value }) => request.cookies.set(name, value));
          resposta = NextResponse.next({ request });
          cookiesParaDefinir.forEach(({ name, value, options }) =>
            resposta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rotaPublica = ROTAS_PUBLICAS.some((r) => request.nextUrl.pathname.startsWith(r));

  if (!user && !rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  resposta.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  );
  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

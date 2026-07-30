import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Força "não cachear nada" em toda resposta da aplicação.
 *
 * Diagnóstico confirmado: em produção na Vercel, o dashboard
 * estava servindo a MESMA página (mesmos dados) para qualquer
 * combinação de filtros na URL — prova de que uma camada de cache
 * (CDN/edge) estava ignorando a query string. Local funcionava
 * corretamente (mesmo código), então não era bug de lógica — era
 * caching de infraestrutura. `revalidate = 0` nas páginas já
 * resolve a causa raiz; este middleware é reforço, garantindo que
 * nenhum cache intermediário guarde a resposta.
 */
export function middleware(request: NextRequest) {
  const resposta = NextResponse.next();
  resposta.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  );
  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SyncButton } from "@/components/SyncButton";

// generateMetadata (em vez do objeto estático `metadata`) roda de
// novo a cada request em páginas dinâmicas — coloca a hora do
// servidor dentro do próprio <title>, o metadado mais básico que
// existe. Se o título não mudar entre dois carregamentos, é cache
// de verdade, sem qualquer dúvida possível.
export async function generateMetadata(): Promise<Metadata> {
  const agora = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    timeStyle: "medium",
  });
  return {
    title: `LicitaRadar [${agora}]`,
    description:
      "Dashboard de prospecção de licitações públicas com dados do PNCP: valores, estados, categorias, prazos e match de documentos.",
  };
}

// Reforço: garante que o layout raiz também nunca seja tratado
// como estático/cacheável, mesmo que uma página filha mude no
// futuro e "esqueça" de forçar isso sozinha.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Carimbo de hora renderizado no servidor a cada request. Se essa
  // hora não mudar entre dois carregamentos, a página está sendo
  // servida de algum cache — prova definitiva, visível, que
  // nenhuma ferramenta de leitura consegue esconder.
  const renderizadoEm = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  });

  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 border-b-2 border-tinta bg-papel/95 backdrop-blur">
          <div className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-10 xl:px-16">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                <Link href="/">
                  Licita<span className="text-verde">Radar</span>
                </Link>
              </h1>
              <p className="font-mono text-xs font-bold text-ambar">
                Página renderizada em: {renderizadoEm}
              </p>
            </div>
            <nav className="flex items-center gap-5">
              <Link
                href="/"
                className="text-base font-semibold hover:text-verde focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde"
              >
                Dashboard
              </Link>
              <Link
                href="/perfil"
                className="text-base font-semibold hover:text-verde focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde"
              >
                Meu perfil
              </Link>
              <SyncButton />
            </nav>
          </div>
        </header>
        <main className="w-full flex-1 px-4 py-8 sm:px-6 lg:px-10 xl:px-16">
          {children}
        </main>
        <footer className="w-full px-4 pb-8 pt-2 text-sm text-cinza sm:px-6 lg:px-10 xl:px-16">
          Fonte dos dados: API pública de consulta do PNCP. A lista de
          documentos por licitação é uma estimativa — confira sempre o edital
          oficial antes de enviar proposta.
        </footer>
      </body>
    </html>
  );
}

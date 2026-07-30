"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Filtros vivem na URL (?uf=PA&categoria=...) — isso é ótimo para
 * compartilhar um link filtrado, mas a usuária pediu explicitamente
 * o oposto: um F5/recarregar deve voltar para a visão padrão, sem
 * filtro nenhum, em vez de manter o que estava na URL.
 *
 * A Performance Navigation API diz exatamente qual foi o tipo de
 * navegação. Se for "reload" (F5, botão de recarregar) e a URL
 * tiver algum filtro, limpamos — mas clicar num link ou usar
 * voltar/avançar do navegador continua preservando o filtro
 * normalmente, porque esses não são "reload".
 */
export function LimparFiltrosAoRecarregar() {
  const router = useRouter();

  useEffect(() => {
    const entradas = performance.getEntriesByType(
      "navigation",
    ) as PerformanceNavigationTiming[];
    const tipo = entradas[0]?.type;

    if (tipo === "reload" && window.location.search) {
      router.replace(window.location.pathname);
    }
  }, [router]);

  return null;
}

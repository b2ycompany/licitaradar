"use client";

import { useEffect } from "react";

/**
 * Boundary de erro do Next.js para toda a árvore sob o layout raiz.
 * Sem isso, uma consulta que falhe depois do connect_timeout (ou
 * qualquer outro erro) deixava a tela presa no esqueleto de
 * carregamento para sempre, sem explicar o motivo.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[erro] Falha ao carregar a página:", error);
  }, [error]);

  return (
    <div className="rounded-xl border-2 border-vermelho bg-white px-6 py-12 text-center">
      <p className="text-xl font-bold text-vermelho">Algo deu errado</p>
      <p className="mx-auto mt-2 max-w-xl text-base text-cinza">
        {error.message || "Erro desconhecido ao carregar os dados."}
      </p>
      <p className="mt-2 font-mono text-xs text-cinza">
        Veja o terminal do <code>npm run dev</code> para o log completo
        (procure por <code>[erro]</code>).
      </p>
      <button
        onClick={reset}
        className="mt-5 rounded-md border-2 border-tinta px-4 py-2 text-sm font-semibold hover:bg-tinta hover:text-papel"
      >
        Tentar de novo
      </button>
    </div>
  );
}

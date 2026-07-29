"use client";

import { useEffect, useState } from "react";

/**
 * Feedback imediato ao navegar. Depois de 12s ainda carregando,
 * mostra um aviso com botão de recarregar — para o usuário NUNCA
 * ficar preso numa tela girando sem nenhuma saída visível, seja
 * qual for o motivo da demora (rede, banco, etc.).
 */
export default function Carregando() {
  const [demorando, setDemorando] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDemorando(true), 12_000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      {demorando && (
        <div className="rounded-lg border-2 border-ambar bg-white p-4">
          <p className="font-semibold text-ambar">Isso está demorando mais que o esperado</p>
          <p className="mt-1 text-sm text-cinza">
            Pode ser uma instabilidade momentânea de rede com o banco de dados.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 rounded-md border-2 border-tinta px-4 py-2 text-sm font-semibold hover:bg-tinta hover:text-papel"
          >
            Recarregar a página
          </button>
        </div>
      )}

      <div className="h-9 w-72 animate-pulse rounded-full bg-borda" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-borda" />
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg bg-borda" />
        ))}
      </div>
      {!demorando && (
        <p className="text-center font-mono text-xs text-cinza">Carregando o radar…</p>
      )}
    </div>
  );
}

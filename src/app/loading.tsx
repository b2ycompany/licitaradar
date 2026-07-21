/** Feedback imediato ao navegar — nada de tela travada sem resposta. */
export default function Carregando() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
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
      <p className="text-center font-mono text-xs text-cinza">
        Carregando o radar…
      </p>
    </div>
  );
}

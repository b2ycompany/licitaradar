/**
 * Medição de performance para depuração. Cada chamada imprime no
 * terminal do `npm run dev` a duração da etapa — é o log que faltava
 * para ver onde o tempo está indo (conexão com o banco, consultas,
 * chamadas ao PNCP etc.).
 *
 * Uso:
 *   const m = medirInicio();
 *   ...
 *   medirFim(m, "nome da etapa");
 */
export function medirInicio(): bigint {
  return process.hrtime.bigint();
}

export function medirFim(inicio: bigint, rotulo: string): number {
  const ms = Number(process.hrtime.bigint() - inicio) / 1_000_000;
  const marca = ms > 2000 ? "🔴" : ms > 800 ? "🟡" : "🟢";
  console.log(`[perf] ${marca} ${rotulo}: ${ms.toFixed(0)}ms`);
  return ms;
}

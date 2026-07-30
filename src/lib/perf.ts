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

/**
 * Erro específico de timeout — deliberado, para o retry (em
 * retry.ts) reconhecer isso como "tenta de novo", igual a um erro
 * de rede.
 */
export class ErroTimeoutConsulta extends Error {
  constructor(rotulo: string, ms: number) {
    super(`TIMEOUT_CONSULTA: "${rotulo}" não respondeu em ${ms}ms`);
    this.name = "ErroTimeoutConsulta";
  }
}

/**
 * Garante um teto de tempo em QUALQUER consulta — sem isso, uma
 * consulta que trava (não erro, não timeout de conexão, só nunca
 * volta) deixava a página pendurada para sempre, sem log nenhum
 * depois do ponto onde travou. Com isso, no máximo `ms` depois ela
 * vira um erro claro (que o comRetry pode tentar de novo, e que o
 * error.tsx mostra na tela em vez de girar infinitamente).
 */
export function comTimeout<T>(promessa: Promise<T>, ms: number, rotulo: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ErroTimeoutConsulta(rotulo, ms)), ms);
    promessa.then(
      (valor) => {
        clearTimeout(timer);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(timer);
        reject(erro);
      },
    );
  });
}

import { medirFim, medirInicio } from "@/lib/perf";

/**
 * Tenta de novo automaticamente quando o erro é de conexão (rede
 * instável, timeout do handshake com o Supabase) — não quando é
 * um erro de dados/lógica, que tentar de novo não resolveria.
 *
 * Sem isso, um pico de instabilidade na rede (ex.: CONNECT_TIMEOUT)
 * derrubava a página inteira na primeira tentativa.
 */
const PADRAO_ERRO_DE_REDE =
  /CONNECT_TIMEOUT|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND/i;

function pareceErroDeRede(erro: unknown): boolean {
  const msg = erro instanceof Error ? `${erro.message} ${erro.name}` : String(erro);
  return PADRAO_ERRO_DE_REDE.test(msg);
}

export async function comRetry<T>(
  fn: () => Promise<T>,
  rotulo: string,
  tentativas = 2,
  esperaMs = 1200,
): Promise<T> {
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    const inicio = medirInicio();
    try {
      const resultado = await fn();
      if (tentativa > 1) {
        console.log(`[perf] 🟢 ${rotulo}: recuperou na tentativa ${tentativa}`);
      }
      return resultado;
    } catch (erro) {
      ultimoErro = erro;
      medirFim(inicio, `${rotulo} (tentativa ${tentativa}/${tentativas} FALHOU)`);

      if (tentativa === tentativas || !pareceErroDeRede(erro)) {
        throw erro;
      }

      console.log(`[perf] 🟡 ${rotulo}: erro de rede, tentando de novo em ${esperaMs}ms…`);
      await new Promise((r) => setTimeout(r, esperaMs));
    }
  }

  throw ultimoErro;
}

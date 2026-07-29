import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { medirFim, medirInicio } from "@/lib/perf";

/**
 * Conexão com o Postgres do Supabase.
 *
 * - Use a string do "Transaction pooler" (porta 6543) no .env.
 * - `prepare: false` é obrigatório com o pooler em modo transação
 *   (o Supavisor não suporta prepared statements nesse modo).
 * - `connect_timeout` é essencial: sem ele, se a rede travar no
 *   handshake, a consulta fica pendurada PARA SEMPRE e a tela de
 *   carregamento nunca sai — em vez disso, agora falha em 10s com
 *   um erro claro no terminal.
 * - A conexão é criada de forma preguiçosa (na primeira consulta),
 *   para o `next build` não exigir DATABASE_URL, e reaproveitada
 *   entre requests (singleton).
 */
type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { db?: Db };

function criarConexao(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não definida. Copie .env.example para .env e preencha com a string de conexão do Supabase.",
    );
  }

  const inicio = medirInicio();

  const cliente = postgres(url, {
    prepare: false,
    max: 5, // menos conexões simultâneas = menos sensível a picos de instabilidade de rede
    connect_timeout: 10, // segundos — falha rápido em vez de travar
    idle_timeout: 20,
    onnotice: () => {}, // silencia avisos NOTICE do Postgres no log
  });

  medirFim(inicio, "db: postgres() instanciado (conexão real é lazy)");

  return drizzle(cliente, { schema });
}

function obterDb(): Db {
  if (!globalForDb.db) {
    globalForDb.db = criarConexao();
  }
  return globalForDb.db;
}

/** Proxy que inicializa a conexão apenas no primeiro uso real. */
export const db: Db = new Proxy({} as Db, {
  get(_alvo, propriedade) {
    const instancia = obterDb() as unknown as Record<PropertyKey, unknown>;
    const valor = instancia[propriedade];
    return typeof valor === "function" ? valor.bind(instancia) : valor;
  },
});

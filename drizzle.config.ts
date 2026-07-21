import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * O drizzle-kit (db:push) precisa inspecionar o schema do banco.
 * O Transaction pooler do Supabase (porta 6543) NÃO serve para
 * isso — trava no "Pulling schema". Use a conexão direta ou o
 * Session pooler (porta 5432) aqui.
 *
 * Preferimos DIRECT_URL; se não existir, caímos para DATABASE_URL.
 */
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "Defina DIRECT_URL (ou DATABASE_URL) no .env com a conexão direta do Supabase (porta 5432).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});

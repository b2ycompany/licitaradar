import { db } from "@/db";
import { documentos, perfil } from "@/db/schema";
import { DOCUMENTOS_PADRAO } from "@/lib/habilitacao";
import { medirFim, medirInicio } from "@/lib/perf";

export const PERFIL_ID = "empresa";

/**
 * Garante que o perfil e o catálogo de documentos existem no banco.
 * É idempotente (ON CONFLICT DO NOTHING), mas antes rodava em TODA
 * página carregada — duas consultas extras a cada clique, sem
 * necessidade depois da primeira vez. Agora só roda uma vez por
 * processo (guarda em memória, sobrevive entre requests).
 */
const globalParaSeed = globalThis as unknown as { seedFeito?: boolean };

export async function garantirSeed() {
  if (globalParaSeed.seedFeito) return;

  const inicio = medirInicio();

  await db
    .insert(perfil)
    .values({ id: PERFIL_ID, atualizadoEm: new Date().toISOString() })
    .onConflictDoNothing();

  if (DOCUMENTOS_PADRAO.length > 0) {
    const agora = new Date().toISOString();
    await db
      .insert(documentos)
      .values(
        DOCUMENTOS_PADRAO.map((d) => ({
          id: d.id,
          nome: d.nome,
          grupo: d.grupo,
          atualizadoEm: agora,
        })),
      )
      .onConflictDoNothing();
  }

  globalParaSeed.seedFeito = true;
  medirFim(inicio, "seed (perfil + documentos-padrão)");
}

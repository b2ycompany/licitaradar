import { db } from "@/db";
import { colunasDocumentoMeta, documentos, perfil } from "@/db/schema";
import { garantirSeed } from "@/lib/seed";
import { medirFim, medirInicio } from "@/lib/perf";
import { comRetry } from "@/lib/retry";
import { PerfilForm } from "@/components/PerfilForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Onboarding da empresa: áreas de interesse, regiões, faixa de
 * valor e o cofre de documentos de habilitação com validade.
 * É isso que alimenta o match verde do dashboard.
 */
export default async function PaginaPerfil() {
  const inicioTotal = medirInicio();

  await garantirSeed();

  const inicioConsultas = medirInicio();
  const [[dadosPerfil], cofre] = await comRetry(
    () =>
      Promise.all([
        db.select().from(perfil).limit(1),
        db.select(colunasDocumentoMeta).from(documentos),
      ]),
    "perfil: 2 consultas",
  );
  medirFim(inicioConsultas, "perfil: 2 consultas");
  medirFim(inicioTotal, "perfil: TOTAL");

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-verde">
        Onboarding
      </p>
      <h2 className="text-2xl font-extrabold tracking-tight">
        Perfil da empresa e cofre de documentos
      </h2>
      <p className="mt-1 max-w-2xl text-base text-cinza">
        Preencha uma vez. O dashboard passa a destacar em verde as
        licitações em que você está apta a entrar, e avisa quando uma
        certidão vence.
      </p>

      <PerfilForm perfilInicial={dadosPerfil ?? null} documentosIniciais={cofre} />
    </div>
  );
}

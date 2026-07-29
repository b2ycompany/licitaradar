import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contratosVencedores, perfil } from "@/db/schema";
import { calcularEstatisticas, calcularIndiceCompetitividade } from "@/lib/concorrencia";
import { ConcorrenciaPainel } from "@/components/ConcorrenciaPainel";

export const dynamic = "force-dynamic";

type Busca = Record<string, string | string[] | undefined>;

export default async function PaginaConcorrencia({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  const params = await searchParams;
  const cnpjOrgao = typeof params.cnpj === "string" ? params.cnpj : "";
  const orgaoNome = typeof params.nome === "string" ? params.nome : "este órgão";

  if (!cnpjOrgao) {
    return (
      <div className="rounded-xl border-2 border-dashed border-borda bg-white px-6 py-12 text-center">
        <p className="text-lg font-semibold">Nenhum órgão selecionado</p>
        <p className="mt-2 text-sm text-cinza">
          Abra uma licitação no dashboard e clique em “Ver concorrência deste
          órgão”.
        </p>
      </div>
    );
  }

  const [contratos, [perfilEmpresa]] = await Promise.all([
    db.select().from(contratosVencedores).where(eq(contratosVencedores.cnpjOrgao, cnpjOrgao)),
    db.select().from(perfil).limit(1),
  ]);

  const temDados = contratos.length > 0;
  const stats = temDados ? calcularEstatisticas(contratos) : null;
  const indice = stats ? calcularIndiceCompetitividade(stats, perfilEmpresa ?? null) : null;

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-verde">
        Inteligência competitiva
      </p>
      <h2 className="text-2xl font-extrabold tracking-tight">{orgaoNome}</h2>
      <p className="mt-1 max-w-2xl text-base text-cinza">
        Histórico de contratos assinados por este órgão, direto do PNCP —
        quem venceu, quanto custou, e o quanto isso combina com o seu
        perfil salvo.
      </p>

      <div className="mt-6">
        <ConcorrenciaPainel
          cnpjOrgao={cnpjOrgao}
          orgaoNome={orgaoNome}
          temDados={temDados}
          stats={stats}
          indice={indice}
        />
      </div>
    </div>
  );
}

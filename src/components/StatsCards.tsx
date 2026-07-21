import { formatarValorCompacto } from "@/lib/format";

interface Props {
  total: number;
  valorTotal: number;
  encerrandoEm7Dias: number;
  aptas: number;
}

function Stat({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: string;
  cor?: "ambar" | "verde";
}) {
  const corValor =
    cor === "ambar" ? "text-ambar" : cor === "verde" ? "text-verde" : "text-tinta";

  return (
    <div className="rounded-xl border border-borda bg-white px-5 py-4">
      <p className="font-mono text-xs uppercase tracking-wide text-cinza">
        {rotulo}
      </p>
      <p className={`mt-1.5 font-mono text-3xl font-semibold ${corValor}`}>
        {valor}
      </p>
    </div>
  );
}

export function StatsCards({
  total,
  valorTotal,
  encerrandoEm7Dias,
  aptas,
}: Props) {
  return (
    <section
      aria-label="Resumo"
      className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4"
    >
      <Stat rotulo="Licitações no filtro" valor={total.toLocaleString("pt-BR")} />
      <Stat
        rotulo="Valor estimado somado"
        valor={valorTotal > 0 ? formatarValorCompacto(valorTotal) : "—"}
      />
      <Stat
        rotulo="Encerram em 7 dias"
        valor={encerrandoEm7Dias.toLocaleString("pt-BR")}
        cor={encerrandoEm7Dias > 0 ? "ambar" : undefined}
      />
      <Stat
        rotulo="Aptas para você"
        valor={aptas.toLocaleString("pt-BR")}
        cor={aptas > 0 ? "verde" : undefined}
      />
    </section>
  );
}

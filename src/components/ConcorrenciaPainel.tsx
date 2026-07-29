"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatarValor } from "@/lib/format";
import type { EstatisticasOrgao, IndiceCompetitividade } from "@/lib/concorrencia";

interface Props {
  cnpjOrgao: string;
  orgaoNome: string;
  temDados: boolean;
  stats: EstatisticasOrgao | null;
  indice: IndiceCompetitividade | null;
}

export function ConcorrenciaPainel({ cnpjOrgao, orgaoNome, temDados, stats, indice }: Props) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/concorrencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpjOrgao }),
      });
      const dados = (await res.json()) as { ok: boolean; erro?: string };
      if (dados.ok) {
        router.refresh();
      } else {
        setErro(dados.erro ?? "Falha ao buscar histórico");
      }
    } catch {
      setErro("Falha de conexão");
    } finally {
      setCarregando(false);
    }
  }

  if (!temDados) {
    return (
      <div className="rounded-xl border-2 border-dashed border-verde bg-white px-6 py-12 text-center">
        <p className="text-lg font-semibold">Sem histórico ainda para {orgaoNome}</p>
        <p className="mx-auto mt-2 max-w-lg text-sm text-cinza">
          Busque os contratos assinados nos últimos 2 anos por este órgão,
          direto na API oficial do PNCP — nome do fornecedor, valores e
          categoria.
        </p>
        <button
          onClick={buscar}
          disabled={carregando}
          className="mt-5 rounded-md bg-verde px-5 py-2.5 text-sm font-semibold text-white hover:bg-verde-escuro disabled:opacity-60"
        >
          {carregando ? "Buscando… (até 30s)" : "Buscar histórico de contratos"}
        </button>
        {erro && <p className="mt-3 text-sm text-vermelho">{erro}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-cinza">
          {stats?.totalContratos} contratos encontrados nos últimos 2 anos
        </p>
        <button
          onClick={buscar}
          disabled={carregando}
          className="rounded-md border border-borda px-3 py-1.5 text-xs font-semibold hover:border-verde hover:text-verde disabled:opacity-60"
        >
          {carregando ? "Atualizando…" : "↻ Atualizar histórico"}
        </button>
      </div>

      {indice && (
        <div className="rounded-xl border-2 border-verde bg-white p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-verde">
              <span className="font-mono text-2xl font-bold text-verde">{indice.indice}%</span>
            </div>
            <div>
              <p className="font-bold">Índice de Competitividade</p>
              <p className="text-xs text-cinza">
                Estimativa com base em dados públicos — não é garantia de vitória.
              </p>
            </div>
          </div>
          {indice.motivos.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-verde-escuro">
              {indice.motivos.map((m, i) => (
                <li key={i}>✓ {m}</li>
              ))}
            </ul>
          )}
          {indice.alertas.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-ambar">
              {indice.alertas.map((a, i) => (
                <li key={i}>⚠ {a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-borda bg-white p-4">
              <p className="font-mono text-xs uppercase text-cinza">Fornecedores distintos</p>
              <p className="mt-1 font-mono text-2xl font-semibold">{stats.fornecedoresDistintos}</p>
            </div>
            <div className="rounded-lg border border-borda bg-white p-4">
              <p className="font-mono text-xs uppercase text-cinza">Valor médio</p>
              <p className="mt-1 font-mono text-2xl font-semibold">{formatarValor(stats.valorMedio)}</p>
            </div>
            <div className="rounded-lg border border-borda bg-white p-4">
              <p className="font-mono text-xs uppercase text-cinza">Menor contrato</p>
              <p className="mt-1 font-mono text-2xl font-semibold">{formatarValor(stats.valorMinimo)}</p>
            </div>
            <div className="rounded-lg border border-borda bg-white p-4">
              <p className="font-mono text-xs uppercase text-cinza">Maior contrato</p>
              <p className="mt-1 font-mono text-2xl font-semibold">{formatarValor(stats.valorMaximo)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-borda bg-white p-5">
            <h3 className="font-semibold">Quem já venceu neste órgão</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-borda text-xs uppercase text-cinza">
                    <th className="pb-2 pr-4">Fornecedor</th>
                    <th className="pb-2 pr-4">Contratos</th>
                    <th className="pb-2">Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.rankingFornecedores.slice(0, 15).map((f) => (
                    <tr key={f.cnpj ?? f.nome} className="border-b border-borda/50">
                      <td className="py-2 pr-4">{f.nome}</td>
                      <td className="py-2 pr-4 font-mono">{f.contratos}</td>
                      <td className="py-2 font-mono">{formatarValor(f.valorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

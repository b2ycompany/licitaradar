"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

const ABAS = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "abertas", rotulo: "Propostas abertas" },
  { valor: "favoritas", rotulo: "Favoritas" },
  { valor: "acompanhando", rotulo: "Acompanhando" },
];

interface Props {
  categorias: string[];
  modalidades: string[];
}

/**
 * Todos os filtros vivem na URL (?uf=PA&categoria=Tecnologia...),
 * o que torna qualquer visão do dashboard compartilhável por link.
 */
export function FiltroBar({ categorias, modalidades }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [busca, setBusca] = useState(params.get("q") ?? "");

  function atualizar(chave: string, valor: string) {
    const novos = new URLSearchParams(params.toString());
    if (valor) {
      novos.set(chave, valor);
    } else {
      novos.delete(chave);
    }
    const query = novos.toString();
    router.replace(query ? `/?${query}` : "/", { scroll: false });
  }

  const abaAtiva = params.get("aba") ?? "todas";
  const soAptas = params.get("aptas") === "1";

  const selectClasses =
    "rounded-md border border-borda bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde";

  return (
    <section aria-label="Filtros" className="mb-6 space-y-3">
      <div className="flex flex-wrap gap-2">
        {ABAS.map((aba) => (
          <button
            key={aba.valor}
            onClick={() => atualizar("aba", aba.valor)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde ${
              abaAtiva === aba.valor
                ? "border-tinta bg-tinta text-papel"
                : "border-borda bg-white text-tinta hover:border-tinta"
            }`}
          >
            {aba.rotulo}
          </button>
        ))}

        <button
          onClick={() => atualizar("aptas", soAptas ? "" : "1")}
          aria-pressed={soAptas}
          className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde ${
            soAptas
              ? "border-verde bg-verde text-white"
              : "border-verde bg-white text-verde hover:bg-verde hover:text-white"
          }`}
        >
          ✓ Só aptas para mim
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            atualizar("q", busca.trim());
          }}
          className="flex min-w-56 flex-1 gap-2"
        >
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar no objeto, órgão ou cidade…"
            aria-label="Buscar no objeto, órgão ou cidade"
            className="w-full rounded-md border border-borda bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde"
          />
          <button
            type="submit"
            className="rounded-md border border-tinta px-3 py-2 text-sm font-semibold hover:bg-tinta hover:text-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde"
          >
            Buscar
          </button>
        </form>

        <select
          value={params.get("uf") ?? ""}
          onChange={(e) => atualizar("uf", e.target.value)}
          aria-label="Filtrar por estado"
          className={selectClasses}
        >
          <option value="">Todos os estados</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>

        <select
          value={params.get("categoria") ?? ""}
          onChange={(e) => atualizar("categoria", e.target.value)}
          aria-label="Filtrar por categoria"
          className={selectClasses}
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={params.get("modalidade") ?? ""}
          onChange={(e) => atualizar("modalidade", e.target.value)}
          aria-label="Filtrar por modalidade"
          className={selectClasses}
        >
          <option value="">Todas as modalidades</option>
          {modalidades.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={params.get("valorMin") ?? ""}
          onChange={(e) => atualizar("valorMin", e.target.value)}
          aria-label="Valor mínimo"
          className={selectClasses}
        >
          <option value="">Valor mín.</option>
          <option value="10000">R$ 10 mil+</option>
          <option value="100000">R$ 100 mil+</option>
          <option value="1000000">R$ 1 mi+</option>
          <option value="10000000">R$ 10 mi+</option>
        </select>
      </div>
    </section>
  );
}

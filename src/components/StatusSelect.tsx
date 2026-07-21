"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_PIPELINE } from "@/db/schema";

interface Props {
  id: string;
  status: string;
}

/** Seletor do pipeline de acompanhamento direto no card. */
export function StatusSelect({ id, status }: Props) {
  const router = useRouter();
  const [valor, setValor] = useState(status);
  const [salvando, setSalvando] = useState(false);

  async function mudar(novo: string) {
    const anterior = valor;
    setValor(novo);
    setSalvando(true);

    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: novo }),
      });
      const dados = (await res.json()) as { ok: boolean };
      if (!dados.ok) setValor(anterior);
      else router.refresh();
    } catch {
      setValor(anterior);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <select
      value={valor}
      disabled={salvando}
      onChange={(e) => mudar(e.target.value)}
      aria-label="Status de acompanhamento"
      className={`rounded-md border px-2 py-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde disabled:opacity-60 ${
        valor === "nova"
          ? "border-borda bg-white text-cinza"
          : valor === "ganha"
            ? "border-verde bg-verde text-white"
            : valor === "perdida"
              ? "border-cinza bg-cinza text-white"
              : "border-ambar bg-white text-ambar"
      }`}
    >
      {STATUS_PIPELINE.map((s) => (
        <option key={s.valor} value={s.valor}>
          {s.rotulo}
        </option>
      ))}
    </select>
  );
}

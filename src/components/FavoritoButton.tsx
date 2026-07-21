"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  id: string;
  favorita: boolean;
}

export function FavoritoButton({ id, favorita }: Props) {
  const router = useRouter();
  const [marcada, setMarcada] = useState(favorita);
  const [enviando, setEnviando] = useState(false);

  async function alternar() {
    setEnviando(true);
    // Atualização otimista: a interface responde na hora
    setMarcada((v) => !v);

    try {
      const res = await fetch("/api/favoritas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const dados = (await res.json()) as { ok: boolean; favorita?: boolean };

      if (dados.ok && typeof dados.favorita === "boolean") {
        setMarcada(dados.favorita);
        router.refresh();
      } else {
        setMarcada(favorita);
      }
    } catch {
      setMarcada(favorita);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <button
      onClick={alternar}
      disabled={enviando}
      aria-pressed={marcada}
      aria-label={marcada ? "Remover das favoritas" : "Salvar nas favoritas"}
      title={marcada ? "Remover das favoritas" : "Salvar nas favoritas"}
      className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde ${
        marcada
          ? "border-verde bg-verde text-white hover:bg-verde-escuro"
          : "border-borda bg-white text-tinta hover:border-verde hover:text-verde"
      }`}
    >
      {marcada ? "★ Salva" : "☆ Salvar"}
    </button>
  );
}

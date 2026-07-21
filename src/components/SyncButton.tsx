"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Dispara a importação de licitações abertas do PNCP.
 *
 * Ao terminar, navega para a home SEM filtros — se o usuário
 * estava com "Só aptas para mim" ou outro filtro restritivo
 * ativo, ele deixa de "sumir" com o resultado recém-importado.
 */
export function SyncButton() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"ok" | "erro">("ok");

  async function sincronizar() {
    setCarregando(true);
    setMensagem(null);

    try {
      const res = await fetch("/api/sync?paginas=20", { method: "POST" });
      const dados = (await res.json()) as {
        ok: boolean;
        importadas?: number;
        aviso?: string;
        erro?: string;
      };

      if (dados.ok) {
        const total = dados.importadas ?? 0;
        setTipo("ok");
        setMensagem(
          total > 0
            ? `${total} licitações atualizadas${dados.aviso ? " (parcial — PNCP limitou o restante)" : ""}`
            : "Sincronizado, mas nada novo encontrado",
        );
        // Limpa os filtros da URL para o resultado aparecer na hora.
        // Só push() — nunca combinar com refresh() no mesmo instante:
        // as duas chamadas competem e travam a navegação seguinte.
        router.push("/?aba=abertas");
      } else {
        setTipo("erro");
        setMensagem(dados.erro ?? "Falha ao sincronizar");
      }
    } catch {
      setTipo("erro");
      setMensagem("Falha de conexão com a API");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {mensagem && (
        <span
          className={`font-mono text-xs ${tipo === "erro" ? "text-vermelho" : "text-cinza"}`}
        >
          {mensagem}
        </span>
      )}
      <button
        onClick={sincronizar}
        disabled={carregando}
        className="rounded-md bg-verde px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-verde-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde disabled:opacity-60"
      >
        {carregando ? "Sincronizando… (até 30s)" : "Sincronizar PNCP"}
      </button>
    </div>
  );
}

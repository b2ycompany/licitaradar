"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Usuario } from "@/db/schema";

interface Props {
  usuarios: Usuario[];
  meuId: string;
}

export function AdminUsuariosPainel({ usuarios, meuId }: Props) {
  const router = useRouter();
  const [carregandoId, setCarregandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(id: string, acao: string) {
    setCarregandoId(id);
    setErro(null);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao }),
      });
      const dados = (await res.json()) as { ok: boolean; erro?: string };
      if (dados.ok) {
        router.refresh();
      } else {
        setErro(dados.erro ?? "Falha ao executar ação");
      }
    } catch {
      setErro("Falha de conexão");
    } finally {
      setCarregandoId(null);
    }
  }

  const pendentes = usuarios.filter((u) => u.status === "pendente");
  const aprovados = usuarios.filter((u) => u.status === "aprovado");
  const rejeitados = usuarios.filter((u) => u.status === "rejeitado");

  return (
    <div className="space-y-8">
      {erro && (
        <p className="rounded-md border border-vermelho bg-white px-3 py-2 text-sm text-vermelho">
          {erro}
        </p>
      )}

      <section>
        <h3 className="font-semibold">
          Pendentes de aprovação <span className="text-cinza">({pendentes.length})</span>
        </h3>
        {pendentes.length === 0 ? (
          <p className="mt-2 text-sm text-cinza">Nenhum cadastro esperando aprovação.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pendentes.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ambar bg-white px-4 py-3"
              >
                <div>
                  <p className="font-semibold">{u.email}</p>
                  <p className="font-mono text-xs text-cinza">
                    Cadastrado em {new Date(u.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => executar(u.id, "aprovar")}
                    disabled={carregandoId === u.id}
                    className="rounded-md bg-verde px-3 py-1.5 text-xs font-semibold text-white hover:bg-verde-escuro disabled:opacity-60"
                  >
                    Aprovar
                  </button>
                  <button
                    onClick={() => executar(u.id, "rejeitar")}
                    disabled={carregandoId === u.id}
                    className="rounded-md border border-vermelho px-3 py-1.5 text-xs font-semibold text-vermelho hover:bg-vermelho hover:text-white disabled:opacity-60"
                  >
                    Rejeitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-semibold">
          Aprovados <span className="text-cinza">({aprovados.length})</span>
        </h3>
        <ul className="mt-2 space-y-2">
          {aprovados.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-borda bg-white px-4 py-3"
            >
              <div>
                <p className="font-semibold">
                  {u.email}
                  {u.isAdmin && (
                    <span className="ml-2 rounded-full bg-verde px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      Admin
                    </span>
                  )}
                  {u.id === meuId && <span className="ml-2 text-xs text-cinza">(você)</span>}
                </p>
                <p className="font-mono text-xs text-cinza">
                  Aprovado em{" "}
                  {u.aprovadoEm
                    ? new Date(u.aprovadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                    : "—"}
                  {u.aprovadoPorEmail ? ` por ${u.aprovadoPorEmail}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {u.isAdmin ? (
                  <button
                    onClick={() => executar(u.id, "remover_admin")}
                    disabled={carregandoId === u.id || u.id === meuId}
                    title={u.id === meuId ? "Você não pode remover seu próprio acesso de admin" : undefined}
                    className="rounded-md border border-borda px-3 py-1.5 text-xs font-semibold hover:border-vermelho hover:text-vermelho disabled:opacity-40"
                  >
                    Remover admin
                  </button>
                ) : (
                  <button
                    onClick={() => executar(u.id, "tornar_admin")}
                    disabled={carregandoId === u.id}
                    className="rounded-md border border-verde px-3 py-1.5 text-xs font-semibold text-verde hover:bg-verde hover:text-white disabled:opacity-60"
                  >
                    Tornar admin
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {rejeitados.length > 0 && (
        <section>
          <h3 className="font-semibold">
            Rejeitados <span className="text-cinza">({rejeitados.length})</span>
          </h3>
          <ul className="mt-2 space-y-2">
            {rejeitados.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-borda bg-white px-4 py-3 opacity-70"
              >
                <p className="font-semibold">{u.email}</p>
                <button
                  onClick={() => executar(u.id, "aprovar")}
                  disabled={carregandoId === u.id}
                  className="rounded-md border border-verde px-3 py-1.5 text-xs font-semibold text-verde hover:bg-verde hover:text-white disabled:opacity-60"
                >
                  Aprovar mesmo assim
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

export function CadastroForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    setSucesso(null);

    try {
      const res = await fetch("/api/auth/cadastrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const dados = (await res.json()) as {
        ok: boolean;
        erro?: string;
        aprovadoDeImediato?: boolean;
      };

      if (!dados.ok) {
        setErro(dados.erro ?? "Não foi possível cadastrar.");
        return;
      }

      setSucesso(
        dados.aprovadoDeImediato
          ? "Conta criada e já aprovada — pode entrar com seu e-mail e senha."
          : "Cadastro enviado! Um administrador precisa aprovar seu acesso antes de você poder entrar.",
      );
    } catch (erro) {
      console.error("[erro] cadastro:", erro);
      setErro(
        erro instanceof Error
          ? `Falha de conexão: ${erro.message}`
          : "Falha de conexão desconhecida — veja o console do navegador (F12) para detalhes.",
      );
    } finally {
      setEnviando(false);
    }
  }

  if (sucesso) {
    return (
      <div className="rounded-md border-2 border-verde bg-white p-4 text-sm">
        <p className="font-semibold text-verde-escuro">{sucesso}</p>
        <a href="/login" className="mt-3 inline-block font-semibold text-verde underline underline-offset-2">
          Ir para o login →
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={cadastrar} className="space-y-4">
      <label className="block text-sm">
        E-mail
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-borda px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde"
        />
      </label>
      <label className="block text-sm">
        Senha
        <input
          type="password"
          required
          minLength={8}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Mínimo 8 caracteres"
          className="mt-1 w-full rounded-md border border-borda px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde"
        />
      </label>

      {erro && <p className="text-sm text-vermelho">{erro}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-md bg-verde px-4 py-2.5 text-sm font-semibold text-white hover:bg-verde-escuro disabled:opacity-60"
      >
        {enviando ? "Enviando…" : "Criar conta"}
      </button>

      <p className="text-center text-sm text-cinza">
        Já tem conta?{" "}
        <a href="/login" className="font-semibold text-verde underline underline-offset-2">
          Entrar
        </a>
      </p>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);

    const supabase = criarClienteSupabaseNavegador();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setErro(
        error.message.includes("Invalid login")
          ? "E-mail ou senha incorretos."
          : error.message,
      );
      setEnviando(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={entrar} className="space-y-4">
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
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mt-1 w-full rounded-md border border-borda px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde"
        />
      </label>

      {erro && <p className="text-sm text-vermelho">{erro}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-md bg-verde px-4 py-2.5 text-sm font-semibold text-white hover:bg-verde-escuro disabled:opacity-60"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>

      <p className="text-center text-sm text-cinza">
        Não tem conta?{" "}
        <a href="/cadastro" className="font-semibold text-verde underline underline-offset-2">
          Cadastre-se
        </a>
      </p>
    </form>
  );
}

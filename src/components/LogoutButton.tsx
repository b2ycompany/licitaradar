"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    const supabase = criarClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={sair}
      disabled={saindo}
      className="text-sm font-semibold text-cinza hover:text-vermelho disabled:opacity-60"
    >
      Sair
    </button>
  );
}

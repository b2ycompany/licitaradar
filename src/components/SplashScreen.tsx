"use client";

import { useEffect, useState } from "react";

/**
 * Tela de abertura da plataforma — aparece só uma vez por sessão do
 * navegador (guardado em sessionStorage), não em toda navegação
 * entre páginas, senão ficaria repetitivo/irritante.
 */
export function SplashScreen() {
  const [estado, setEstado] = useState<"oculto" | "visivel" | "saindo">("oculto");

  useEffect(() => {
    const jaViu = sessionStorage.getItem("licitaradar_splash_visto");
    if (jaViu) return;

    sessionStorage.setItem("licitaradar_splash_visto", "1");
    setEstado("visivel");

    const t1 = setTimeout(() => setEstado("saindo"), 1000);
    const t2 = setTimeout(() => setEstado("oculto"), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (estado === "oculto") return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-tinta text-papel transition-opacity duration-500 ${
        estado === "saindo" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
        Licita<span className="text-verde">Radar</span>
      </h1>
      <p className="mt-3 font-mono text-xs uppercase tracking-[0.3em] text-cinza">
        Radar de licitações públicas
      </p>
    </div>
  );
}

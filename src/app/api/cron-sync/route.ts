import { NextResponse } from "next/server";
import { executarSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * GET /api/cron-sync
 * Chamada automaticamente pelo Vercel Cron (vercel.json) — roda
 * sozinha, sem precisar de ninguém clicar em nada. Protegida pelo
 * header que a própria Vercel injeta (CRON_SECRET, provisionado
 * automaticamente ao registrar o cron).
 */
export async function GET(req: Request) {
  const cabecalhoAuth = req.headers.get("authorization");
  const segredo = process.env.CRON_SECRET;

  if (segredo && cabecalhoAuth !== `Bearer ${segredo}`) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }

  try {
    const resultado = await executarSync({ paginasPorEstado: 10 });
    console.log(`[perf] cron-sync: ${resultado.importadas} licitações, ${resultado.estadosConcluidos}/${resultado.totalEstados} estados`);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (erro) {
    console.error("Erro no cron-sync:", erro);
    return NextResponse.json(
      { ok: false, erro: erro instanceof Error ? erro.message : "Erro desconhecido" },
      { status: 502 },
    );
  }
}

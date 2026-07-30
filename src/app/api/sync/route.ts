import { executarSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * POST /api/sync?paginasPorEstado=3
 * Sincronização manual disparada pelo botão — mesma lógica central
 * de src/lib/sync.ts, só que transmitindo o progresso em stream
 * (ND-JSON) para a tela acompanhar em tempo real.
 */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const paginasPorEstado = Number(searchParams.get("paginasPorEstado")) || 3;
  const codificador = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function enviar(evento: Record<string, unknown>) {
        controller.enqueue(codificador.encode(JSON.stringify(evento) + "\n"));
      }

      enviar({ tipo: "inicio", paginasPorEstado });

      try {
        const resultado = await executarSync({ paginasPorEstado, aoEvento: enviar });
        enviar({ tipo: "fim", ok: true, ...resultado });
      } catch (erro) {
        console.error("Erro ao sincronizar com o PNCP:", erro);
        enviar({
          tipo: "fim",
          ok: false,
          erro: erro instanceof Error ? erro.message : "Erro desconhecido no sync",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** GET como atalho para testar no navegador ou via curl. */
export async function GET(req: Request) {
  return POST(req);
}

"use client";

import { useState } from "react";

interface Progresso {
  uf: string;
  pagina: number;
  estadosConcluidos: number;
  totalEstados: number;
  totalImportadas: number;
}

/**
 * Dispara a importação de licitações do PNCP, estado por estado,
 * e acompanha o progresso EM TEMPO REAL via stream (ND-JSON).
 *
 * Ao terminar, tenta um reload automático — mas NUNCA depende só
 * disso: sempre mostra também um link real e clicável para o
 * dashboard, que funciona garantido mesmo se o redirecionamento
 * automático falhar por qualquer motivo.
 */
export function SyncButton() {
  const [carregando, setCarregando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [tentativa, setTentativa] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<{
    importadas: number;
    estadosConcluidos: number;
    totalEstados: number;
    estadosFaltando: string[];
    parcial: boolean;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function sincronizar() {
    setCarregando(true);
    setProgresso(null);
    setTentativa(null);
    setConcluido(null);
    setErro(null);

    try {
      const res = await fetch("/api/sync?paginasPorEstado=2", { method: "POST" });

      if (!res.body) {
        const dados = (await res.json()) as { ok: boolean; importadas?: number; erro?: string };
        if (dados.ok) {
          setCarregando(false);
          window.location.assign("/?aba=abertas");
        } else {
          setErro(dados.erro ?? "Falha ao sincronizar");
          setCarregando(false);
        }
        return;
      }

      const leitor = res.body.getReader();
      const decodificador = new TextDecoder();
      let restante = "";

      leitura: while (true) {
        const { done, value } = await leitor.read();
        if (value) restante += decodificador.decode(value, { stream: true });
        if (done) restante += decodificador.decode();

        const linhas = restante.split("\n");
        restante = done ? "" : (linhas.pop() ?? "");

        for (const linha of linhas) {
          if (!linha.trim()) continue;

          let evento: Record<string, unknown>;
          try {
            evento = JSON.parse(linha);
          } catch {
            continue;
          }

          if (evento.tipo === "estado") {
            setTentativa(null);
            setProgresso({
              uf: evento.uf as string,
              pagina: evento.pagina as number,
              estadosConcluidos: evento.estadosConcluidos as number,
              totalEstados: evento.totalEstados as number,
              totalImportadas: evento.totalImportadas as number,
            });
          } else if (evento.tipo === "tentativa") {
            const motivo = evento.motivo === "429" ? "PNCP limitou o ritmo" : "PNCP demorou a responder";
            setTentativa(
              `${evento.uf}: ${motivo}, tentando de novo (${evento.tentativa}/${evento.maxTentativas})…`,
            );
          } else if (evento.tipo === "fim") {
            setCarregando(false);
            if (evento.ok) {
              setConcluido({
                importadas: (evento.importadas as number) ?? 0,
                estadosConcluidos: (evento.estadosConcluidos as number) ?? 0,
                totalEstados: (evento.totalEstados as number) ?? 27,
                estadosFaltando: (evento.estadosFaltando as string[]) ?? [],
                parcial: Boolean(evento.aviso),
              });
              setTimeout(() => window.location.assign("/?aba=abertas"), 1500);
            } else {
              setErro((evento.erro as string) ?? "Falha ao sincronizar");
            }
            break leitura;
          }
        }

        if (done) break;
      }
    } catch {
      setErro("Falha de conexão com a API");
      setCarregando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={sincronizar}
        disabled={carregando}
        className="rounded-md bg-verde px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-verde-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde disabled:opacity-60"
      >
        {carregando ? "Sincronizando…" : "Sincronizar PNCP"}
      </button>

      {carregando && progresso && (
        <div className="w-64">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-borda">
            <div
              className="h-full bg-verde transition-all"
              style={{
                width: `${Math.min(100, Math.round((progresso.estadosConcluidos / progresso.totalEstados) * 100))}%`,
              }}
            />
          </div>
          <p className="mt-1 text-right font-mono text-[11px] text-cinza">
            {progresso.uf} ({progresso.estadosConcluidos}/{progresso.totalEstados} estados) ·{" "}
            {progresso.totalImportadas} licitações até agora
          </p>
        </div>
      )}

      {carregando && tentativa && (
        <p className="max-w-64 text-right font-mono text-[11px] text-ambar">{tentativa}</p>
      )}

      {concluido && (
        <div className="max-w-64 rounded-md border border-verde bg-white px-3 py-2 text-right">
          <p className="font-mono text-[11px] font-semibold text-verde-escuro">
            ✓ {concluido.importadas} licitações · {concluido.estadosConcluidos}/{concluido.totalEstados} estados
            {concluido.parcial ? " (parcial)" : ""}
          </p>
          {concluido.estadosFaltando.length > 0 && (
            <p className="mt-0.5 font-mono text-[10px] text-cinza">
              Faltou: {concluido.estadosFaltando.join(", ")} — sincronize de novo para completar
            </p>
          )}
          <a
            href="/?aba=abertas"
            className="mt-1 inline-block text-xs font-semibold text-verde underline underline-offset-2"
          >
            Ver no dashboard →
          </a>
        </div>
      )}

      {erro && (
        <p className="max-w-64 text-right font-mono text-[11px] text-vermelho">{erro}</p>
      )}
    </div>
  );
}

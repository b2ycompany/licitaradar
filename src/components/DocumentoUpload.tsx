"use client";

import { useRef, useState } from "react";

interface Props {
  docId: string;
  arquivoNome: string | null;
  aoEnviar: () => void;
}

/** Upload do arquivo de um documento do cofre (PDF/JPG/PNG). */
export function DocumentoUpload({ docId, arquivoNome, aoEnviar }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState<string | null>(arquivoNome);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivo: File) {
    setEnviando(true);
    setErro(null);

    try {
      const form = new FormData();
      form.set("id", docId);
      form.set("arquivo", arquivo);

      const res = await fetch("/api/documentos/upload", {
        method: "POST",
        body: form,
      });
      const dados = (await res.json()) as {
        ok: boolean;
        erro?: string;
        arquivoNome?: string;
      };

      if (dados.ok) {
        setNome(dados.arquivoNome ?? arquivo.name);
        aoEnviar();
      } else {
        setErro(dados.erro ?? "Falha no upload");
      }
    } catch {
      setErro("Falha de conexão no upload");
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    setEnviando(true);
    try {
      await fetch(`/api/documentos/${docId}/arquivo`, { method: "DELETE" });
      setNome(null);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) enviar(f);
          e.target.value = "";
        }}
      />

      {nome ? (
        <>
          <a
            href={`/api/documentos/${docId}/arquivo`}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-40 truncate font-semibold text-verde underline underline-offset-2"
            title={nome}
          >
            📎 {nome}
          </a>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="rounded-md border border-borda px-2 py-1 font-semibold hover:border-verde hover:text-verde disabled:opacity-50"
          >
            Trocar
          </button>
          <button
            type="button"
            onClick={remover}
            disabled={enviando}
            className="rounded-md border border-borda px-2 py-1 font-semibold text-cinza hover:border-vermelho hover:text-vermelho disabled:opacity-50"
          >
            Remover
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="rounded-md border border-verde px-2.5 py-1 font-semibold text-verde hover:bg-verde hover:text-white disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "⬆ Enviar arquivo"}
        </button>
      )}

      {erro && <span className="text-vermelho">{erro}</span>}
    </div>
  );
}

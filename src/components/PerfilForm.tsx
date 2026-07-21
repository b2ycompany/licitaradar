"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentoMeta, Perfil } from "@/db/schema";
import { DocumentoUpload } from "./DocumentoUpload";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

const CATEGORIAS = [
  "Tecnologia",
  "Engenharia e Obras",
  "Saúde",
  "Educação",
  "Alimentação",
  "Veículos e Transporte",
  "Facilities e Limpeza",
  "Móveis e Equipamentos",
  "Consultoria e Serviços Técnicos",
  "Outros",
];

function parseJsonArray(texto: string | undefined): string[] {
  if (!texto) return [];
  try {
    const v = JSON.parse(texto);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

interface Props {
  perfilInicial: Perfil | null;
  documentosIniciais: DocumentoMeta[];
}

export function PerfilForm({ perfilInicial, documentosIniciais }: Props) {
  const router = useRouter();

  const [nomeEmpresa, setNomeEmpresa] = useState(
    perfilInicial?.nomeEmpresa ?? "",
  );
  const [categorias, setCategorias] = useState<string[]>(
    parseJsonArray(perfilInicial?.categorias),
  );
  const [ufs, setUfs] = useState<string[]>(parseJsonArray(perfilInicial?.ufs));
  const [valorMin, setValorMin] = useState(
    perfilInicial?.valorMin ? String(perfilInicial.valorMin) : "",
  );
  const [valorMax, setValorMax] = useState(
    perfilInicial?.valorMax ? String(perfilInicial.valorMax) : "",
  );
  const [docs, setDocs] = useState(
    documentosIniciais.map((d) => ({
      id: d.id,
      nome: d.nome,
      grupo: d.grupo,
      possui: d.possui,
      validade: d.validade ?? "",
      arquivoNome: d.arquivoNome,
    })),
  );
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const ordem = [
      "Jurídica",
      "Fiscal e Trabalhista",
      "Econômico-financeira",
      "Técnica",
    ];
    return ordem
      .map((g) => ({ grupo: g, itens: docs.filter((d) => d.grupo === g) }))
      .filter((g) => g.itens.length > 0);
  }, [docs]);

  function alternarLista(
    lista: string[],
    setLista: (v: string[]) => void,
    valor: string,
  ) {
    setLista(
      lista.includes(valor)
        ? lista.filter((v) => v !== valor)
        : [...lista, valor],
    );
  }

  function atualizarDoc(
    id: string,
    campo: "possui" | "validade",
    valor: boolean | string,
  ) {
    setDocs((atuais) =>
      atuais.map((d) => (d.id === id ? { ...d, [campo]: valor } : d)),
    );
  }

  /** Upload marca "possui" automaticamente. */
  function aoEnviarArquivo(id: string) {
    setDocs((atuais) =>
      atuais.map((d) => (d.id === id ? { ...d, possui: true } : d)),
    );
    router.refresh();
  }

  async function salvar() {
    setSalvando(true);
    setMensagem(null);

    try {
      const res = await fetch("/api/perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeEmpresa,
          categorias,
          ufs,
          valorMin: valorMin ? Number(valorMin) : null,
          valorMax: valorMax ? Number(valorMax) : null,
          documentos: docs.map((d) => ({
            id: d.id,
            possui: d.possui,
            validade: d.validade || null,
          })),
        }),
      });

      const dados = (await res.json()) as { ok: boolean; erro?: string };
      setMensagem(dados.ok ? "Perfil salvo!" : (dados.erro ?? "Erro ao salvar"));
      if (dados.ok) router.refresh();
    } catch {
      setMensagem("Falha de conexão ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  const chipClasses = (ativo: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde ${
      ativo
        ? "border-verde bg-verde text-white"
        : "border-borda bg-white text-tinta hover:border-verde"
    }`;

  return (
    <div className="mt-6 space-y-6 pb-10">
      {/* Linha 1: dados da empresa + faixa de valor lado a lado no notebook */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-borda bg-white p-5 lg:col-span-2">
          <h3 className="font-semibold">Dados da empresa</h3>
          <label className="mt-3 block text-sm">
            Nome da empresa
            <input
              type="text"
              value={nomeEmpresa}
              onChange={(e) => setNomeEmpresa(e.target.value)}
              placeholder="Razão social ou nome fantasia"
              className="mt-1 w-full rounded-md border border-borda px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde"
            />
          </label>
        </section>

        <section className="rounded-lg border border-borda bg-white p-5">
          <h3 className="font-semibold">Faixa de valor (R$)</h3>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="text-sm">
              Mínimo
              <input
                type="number"
                min="0"
                value={valorMin}
                onChange={(e) => setValorMin(e.target.value)}
                placeholder="ex.: 50000"
                className="mt-1 block w-full rounded-md border border-borda px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde"
              />
            </label>
            <label className="text-sm">
              Máximo
              <input
                type="number"
                min="0"
                value={valorMax}
                onChange={(e) => setValorMax(e.target.value)}
                placeholder="ex.: 5000000"
                className="mt-1 block w-full rounded-md border border-borda px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde"
              />
            </label>
          </div>
        </section>
      </div>

      {/* Linha 2: áreas de interesse + regiões lado a lado no notebook */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-borda bg-white p-5">
          <h3 className="font-semibold">Áreas de interesse</h3>
          <p className="mt-1 text-xs text-cinza">
            Licitações dessas categorias ganham prioridade no seu score.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CATEGORIAS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => alternarLista(categorias, setCategorias, c)}
                className={chipClasses(categorias.includes(c))}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-borda bg-white p-5">
          <h3 className="font-semibold">Regiões de atuação</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {UFS.map((uf) => (
              <button
                key={uf}
                type="button"
                onClick={() => alternarLista(ufs, setUfs, uf)}
                className={chipClasses(ufs.includes(uf))}
              >
                {uf}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Cofre: full width, grupos em grid 2 colunas no notebook */}
      <section className="rounded-lg border border-borda bg-white p-5">
        <h3 className="font-semibold">Cofre de documentos de habilitação</h3>
        <p className="mt-1 max-w-3xl text-xs text-cinza">
          Anexe o arquivo (PDF/JPG/PNG, até 8 MB) e informe a validade das
          certidões. O upload já marca o documento como “tenho”. É isso que
          libera o selo verde “Apta” no dashboard e alimenta a montagem
          automática do dossiê.
        </p>

        <div className="mt-4 grid gap-6 xl:grid-cols-2">
          {grupos.map(({ grupo, itens }) => (
            <div key={grupo}>
              <p className="font-mono text-xs uppercase tracking-wide text-verde">
                {grupo}
              </p>
              <ul className="mt-2 space-y-2">
                {itens.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-col gap-2 rounded-md border border-borda px-3 py-2 md:flex-row md:flex-wrap md:items-center md:gap-3"
                  >
                    <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={d.possui}
                        onChange={(e) =>
                          atualizarDoc(d.id, "possui", e.target.checked)
                        }
                        className="h-4 w-4 accent-verde"
                      />
                      {d.nome}
                    </label>

                    <DocumentoUpload
                      docId={d.id}
                      arquivoNome={d.arquivoNome}
                      aoEnviar={() => aoEnviarArquivo(d.id)}
                    />

                    <label className="text-xs text-cinza">
                      Válido até{" "}
                      <input
                        type="date"
                        value={d.validade}
                        onChange={(e) =>
                          atualizarDoc(d.id, "validade", e.target.value)
                        }
                        disabled={!d.possui}
                        className="rounded-md border border-borda px-2 py-1 text-xs disabled:opacity-40"
                      />
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={salvar}
          disabled={salvando}
          className="rounded-md bg-verde px-5 py-2.5 text-sm font-semibold text-white hover:bg-verde-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar perfil"}
        </button>
        {mensagem && (
          <span className="font-mono text-xs text-cinza">{mensagem}</span>
        )}
      </div>
    </div>
  );
}

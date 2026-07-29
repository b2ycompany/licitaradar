import type { Licitacao } from "@/db/schema";
import type { Avaliacao } from "@/lib/match";
import { diasAte, formatarData, formatarValor } from "@/lib/format";
import { linkEditalPncp } from "@/lib/pncp";
import { FavoritoButton } from "./FavoritoButton";
import { StatusSelect } from "./StatusSelect";

/** Selo de prazo: verde (>7 dias), âmbar (3–7), vermelho (<3). */
function SeloPrazo({ encerramento }: { encerramento: string | null }) {
  const dias = diasAte(encerramento);

  if (dias === null) {
    return (
      <div className="selo selo-encerrado" aria-label="Prazo não informado">
        <span className="text-lg font-semibold">?</span>
        <span className="text-[9px] uppercase">prazo</span>
      </div>
    );
  }

  if (dias < 0) {
    return (
      <div className="selo selo-encerrado" aria-label="Prazo encerrado">
        <span className="text-[10px] font-semibold uppercase">encerrada</span>
      </div>
    );
  }

  const classe = dias > 7 ? "selo-ok" : dias >= 3 ? "selo-atencao" : "selo-urgente";
  const rotulo = dias === 0 ? "hoje" : dias === 1 ? "dia" : "dias";

  return (
    <div className={`selo ${classe}`} aria-label={`Encerra em ${dias} dias`}>
      {dias > 0 && <span className="text-xl font-semibold">{dias}</span>}
      <span className="text-[9px] uppercase">{rotulo}</span>
    </div>
  );
}

/** Chip da fase de participação, calculada pelas datas oficiais. */
function ChipFase({ avaliacao, abertura }: { avaliacao: Avaliacao; abertura: string | null }) {
  if (avaliacao.fase === "recebendo") {
    return (
      <span className="rounded-full bg-verde px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
        Recebendo propostas
      </span>
    );
  }
  if (avaliacao.fase === "aguardando") {
    const dias = diasAte(abertura);
    return (
      <span className="rounded-full bg-ambar px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
        {dias !== null && dias >= 0 ? `Abre em ${dias === 0 ? "breve" : `${dias} dia${dias === 1 ? "" : "s"}`}` : "Aguardando abertura"}
      </span>
    );
  }
  if (avaliacao.fase === "encerrada") {
    return (
      <span className="rounded-full bg-cinza px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
        Prazo encerrado
      </span>
    );
  }
  return null;
}

export function LicitacaoCard({
  licitacao,
  avaliacao,
}: {
  licitacao: Licitacao;
  avaliacao: Avaliacao;
}) {
  const linkPncp = linkEditalPncp(licitacao);
  const pendencias = [...avaliacao.docsFaltando, ...avaliacao.docsVencidos];

  return (
    <article
      className={`card-licitacao rounded-lg border bg-white p-4 ${
        avaliacao.apta ? "border-l-4 border-verde" : "border-borda"
      }`}
    >
      <div className="flex items-start gap-4">
        <SeloPrazo encerramento={licitacao.dataEncerramentoProposta} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ChipFase
              avaliacao={avaliacao}
              abertura={licitacao.dataAberturaProposta}
            />
            {avaliacao.apta && (
              <span className="rounded-full border-2 border-verde px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-verde">
                ✓ Apta — documentos OK
              </span>
            )}
            <span
              className="rounded-full bg-papel px-2.5 py-0.5 font-mono text-[11px] font-semibold text-verde-escuro"
              title="Score de aderência ao seu perfil e documentos"
            >
              Aderência {avaliacao.score}%
            </span>
          </div>

          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-wide text-cinza">
            {licitacao.modalidadeNome ?? "Modalidade não informada"}
            {licitacao.srp ? " · Registro de preços" : ""}
            {licitacao.situacao ? ` · ${licitacao.situacao}` : ""}
          </p>

          <h3 className="mt-1 line-clamp-3 text-sm font-semibold leading-snug">
            {licitacao.objeto}
          </h3>

          <p className="mt-1 truncate text-xs text-cinza">
            {licitacao.orgao}
            {licitacao.municipio ? ` — ${licitacao.municipio}` : ""}
            {licitacao.uf ? `/${licitacao.uf}` : ""}
            {licitacao.esfera ? ` · ${licitacao.esfera}` : ""}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="rounded bg-papel px-2 py-0.5 font-semibold text-verde-escuro">
              {licitacao.categoria}
            </span>
            <span className="font-mono font-semibold">
              {formatarValor(licitacao.valorEstimado)}
            </span>
            <span className="text-cinza">
              Propostas até {formatarData(licitacao.dataEncerramentoProposta)}
            </span>
          </div>

          {pendencias.length > 0 && avaliacao.fase !== "encerrada" && (
            <p className="mt-2 text-xs text-ambar">
              Para participar, falta:{" "}
              {pendencias
                .slice(0, 3)
                .map((d) => d.nome)
                .join("; ")}
              {pendencias.length > 3 ? ` e mais ${pendencias.length - 3}` : ""}{" "}
              —{" "}
              <a href="/perfil" className="font-semibold underline underline-offset-2">
                atualizar no perfil
              </a>
              <span className="text-cinza"> (estimativa — confirme no edital)</span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <FavoritoButton id={licitacao.id} favorita={licitacao.favorita} />
          <StatusSelect id={licitacao.id} status={licitacao.status} />
          {linkPncp && (
            <a
              href={linkPncp}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-verde underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde"
            >
              Ver edital no PNCP ↗
            </a>
          )}
        </div>
      </div>

      <p className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-borda pt-2">
        <span className="font-mono text-[10px] text-cinza">
          Nº controle PNCP: {licitacao.id}
        </span>
        {licitacao.cnpjOrgao && (
          <a
            href={`/concorrencia?cnpj=${licitacao.cnpjOrgao}&nome=${encodeURIComponent(licitacao.orgao)}`}
            className="text-xs font-semibold text-verde-escuro underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-verde"
          >
            📊 Ver concorrência deste órgão
          </a>
        )}
      </p>
    </article>
  );
}

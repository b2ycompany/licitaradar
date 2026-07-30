/** Formata um valor em reais. Valores nulos/zerados viram traço. */
export function formatarValor(valor: number | null | undefined): string {
  if (!valor || valor <= 0) return "—";
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** Formata valores grandes de forma compacta (R$ 1,2 mi). */
export function formatarValorCompacto(valor: number): string {
  if (valor >= 1_000_000_000)
    return `R$ ${(valor / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi`;
  if (valor >= 1_000_000)
    return `R$ ${(valor / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (valor >= 1_000)
    return `R$ ${(valor / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return formatarValor(valor);
}

/**
 * Formata uma data ISO como dd/mm/aaaa hh:mm, sempre no horário de
 * Brasília — sem isso, o servidor da Vercel roda em UTC e todo
 * prazo de proposta aparecia 3 horas adiantado (ex.: "17:00"
 * quando o prazo real era 14:00).
 */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Dias (inteiros, arredondando para cima) até uma data ISO. */
export function diasAte(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

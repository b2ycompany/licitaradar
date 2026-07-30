interface Props {
  abertas: number;
  emAndamento: number;
  encerradas: number;
}

/**
 * Resumo rápido de quantas licitações do filtro atual estão em
 * cada fase — a pergunta mais básica ("quantas eu posso disputar
 * agora?") sem precisar contar card por card.
 */
export function FaseBadges({ abertas, emAndamento, encerradas }: Props) {
  const itens = [
    { rotulo: "Abertas", valor: abertas, classe: "border-verde text-verde-escuro" },
    { rotulo: "Em andamento", valor: emAndamento, classe: "border-ambar text-ambar" },
    { rotulo: "Encerradas", valor: encerradas, classe: "border-cinza text-cinza" },
  ];

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {itens.map((item) => (
        <span
          key={item.rotulo}
          className={`inline-flex items-center gap-1.5 rounded-full border-2 bg-white px-3 py-1 text-xs font-bold ${item.classe}`}
        >
          {item.rotulo}
          <span className="font-mono">{item.valor}</span>
        </span>
      ))}
    </div>
  );
}

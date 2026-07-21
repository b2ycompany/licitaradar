# LicitaRadar

Radar de licitações públicas brasileiras. Importa contratações com propostas em aberto da API pública do PNCP (Lei 14.133/2021), categoriza automaticamente por área (Tecnologia, Engenharia e Obras, Saúde etc.) e exibe tudo num dashboard com filtros por estado, categoria, modalidade, valor e busca textual.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** — frontend e backend no mesmo projeto
- **Supabase (Postgres)** + **Drizzle ORM** (driver postgres.js)
- **Tailwind CSS** — estilização

## Pré-requisitos

- Node.js 18.18+ (recomendado: 20 ou 22) — https://nodejs.org
- Uma conta gratuita no Supabase — https://supabase.com

## Passo a passo

### 1. Criar o projeto no Supabase

1. Acesse https://supabase.com → **New project**
2. Escolha nome (ex.: `licitaradar`), defina uma **senha do banco** (guarde-a!) e a região `South America (São Paulo)`
3. Com o projeto criado: **Project Settings → Database → Connection string → URI**, aba **Transaction pooler** (porta 6543). Copie a string.

### 2. Configurar o ambiente

```bash
# Instalar as dependências
npm install

# Criar o arquivo de variáveis de ambiente
cp .env.example .env
```

Abra o `.env` e cole a string de conexão do Supabase em `DATABASE_URL`, trocando `[YOUR-PASSWORD]` pela senha do banco.

### 3. Criar a tabela e rodar

```bash
# Cria a tabela licitacoes no Supabase
npm run db:push

# Sobe o servidor de desenvolvimento
npm run dev
```

Abra http://localhost:3000 e clique em **Sincronizar PNCP**. A primeira importação traz até 500 licitações com propostas em aberto (10 páginas × 50 registros). Para importar mais:

```bash
# até 40 páginas (~2.000 registros) via terminal
curl -X POST "http://localhost:3000/api/sync?paginas=40"
```

Você pode conferir os dados chegando em **Table Editor → licitacoes** no painel do Supabase.

## Estrutura

```
src/
  app/
    page.tsx              # Dashboard (server component; filtros via URL)
    layout.tsx            # Layout, fontes e cabeçalho
    globals.css           # Tailwind + estilos do selo de prazo
    api/
      sync/route.ts       # POST /api/sync — importa do PNCP (upsert em lote)
      favoritas/route.ts  # POST /api/favoritas — favoritar
  components/             # FiltroBar, LicitacaoCard, StatsCards, etc.
  db/
    schema.ts             # Tabela licitacoes (Drizzle / Postgres)
    index.ts              # Conexão postgres.js (pooler, lazy, singleton)
  lib/
    pncp.ts               # Cliente da API de consulta do PNCP
    categorize.ts         # Categorização por palavras-chave
    format.ts             # Moeda, datas, prazos
```

## Decisões de projeto

- **Endpoint `/v1/contratacoes/proposta`** do PNCP: retorna somente licitações em que ainda é possível enviar proposta — exatamente o que interessa para prospecção.
- **Upsert em lote por `numeroControlePNCP`**: uma ida ao banco por página importada; sincronizações repetidas atualizam os dados oficiais sem perder o que é seu (favoritas, status).
- **Transaction pooler + `prepare: false`**: configuração recomendada do Supabase para apps serverless (Vercel).
- **Busca com `ILIKE`**: case-insensitive nativa do Postgres.
- **Filtros na URL**: qualquer visão do dashboard pode ser compartilhada por link.

## Deploy na Vercel (quando quiser)

1. Suba o projeto para um repositório no GitHub
2. Na Vercel: **Add New → Project**, importe o repositório
3. Em **Environment Variables**, adicione `DATABASE_URL` com a mesma string do `.env`
4. Para sincronizar sozinho todo dia, crie um `vercel.json` com um cron chamando `/api/sync` — e proteja a rota com um token antes de publicar

## Aviso

Os dados vêm da API pública de consulta do PNCP e podem ter defasagem ou lacunas. Sempre confira o edital oficial antes de preparar e enviar uma proposta.

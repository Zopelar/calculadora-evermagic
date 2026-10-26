# Evermagic Prize Pool · calculadora não oficial

Mostra quanto cada jogador ganharia se a Season 0 Alpha do Evermagic acabasse agora:
pool total (USDT / EVA / R$), ranking com ganho estimado, busca por nick, guildas, classes, simulador.

Next.js (App Router) + TypeScript + Tailwind + viem. Sem banco de dados.

## Rodar local

Requer Node 20.9+ (testado no 24).

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # testes unitários (Vitest)
npm run build      # build de produção (também checa tipos)
```

Para ver os dados crus que o site usa:

```bash
curl http://localhost:3000/api/pool
curl http://localhost:3000/api/ranking
```

## Deploy na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Em vercel.com → **Add New → Project** → importe o repositório. A Vercel detecta Next.js sozinha; não precisa mudar nada no build.
3. (Opcional) Em **Settings → Environment Variables**, defina `ARBITRUM_RPC_URL` com um RPC próprio (Alchemy, Infura etc.) se o público `https://arb1.arbitrum.io/rpc` começar a limitar.
4. Deploy. Ou, pela CLI: `npx vercel` (preview) e `npx vercel --prod`.

## De onde vem cada dado

| Dado | Fonte | Observação |
| --- | --- | --- |
| Ranking de gold (top 100) | `GET na-bridge.evermagic.io/bridge/ranking/gold` | Mesmo endpoint da página oficial de leaderboard. Não exige `Origin`/`Referer`; tem rate limit (20 req/janela). |
| Ranking de guildas | `GET na-bridge.evermagic.io/bridge/ranking/guild` | Traz nível, GP e total de membros de cada guilda. |
| Ranking de nível (top 100) | `GET na-bridge.evermagic.io/bridge/ranking/level` | Única fonte da classe (`knight`, `archer`, `mage`). Vem junto em `/api/ranking`, com o mesmo cache. Usado na aba Classes, no ícone de classe da aba Jogadores e na busca. |
| Saldo da pool | Arbitrum One, `balanceOf` de EVA e USDT na carteira `0x139061180aDea785DD8A1a32e4A2B1188d2621A1` | Lido ao vivo via viem (multicall). |
| Preço do EVA | `GET na-bridge.evermagic.io/bridge/eva/price?amount=1` | Mesma fonte da página evermagic.io/prizepool. |
| USDT → BRL | `api.coinbase.com/v2/exchange-rates?currency=USDT` | Opcional: se falhar, os valores em R$ aparecem como "—". A AwesomeAPI não é usada porque responde HTTP 429 para os IPs da Vercel. |

Endereços, URLs, percentuais da divisão e data de fim da season ficam em [config.ts](config.ts).

### Cache e falhas

- As rotas `/api/ranking` e `/api/pool` buscam as fontes **pelo servidor**, guardam o resultado em memória por 5 minutos e respondem com `Cache-Control: s-maxage=300`, então a CDN da Vercel segura o tráfego e as fontes não são chamadas a cada visita.
- Se uma fonte falhar, o servidor devolve o último dado bom e o site mostra "dados de HH:MM".
- Depois de uma falha, a fonte só é tentada de novo após 1 minuto (não a cada visita).
- O navegador atualiza a cada 5 minutos.
- Requisições saem com o User-Agent `evermagic-pool-calc/1.0` (ajuste em `config.ts`).

## Cálculo

```
poolTotalUSDT  = saldoEVA × precoEVA + saldoUSDT
poolIndividual = poolTotalUSDT × 0,75
goldTotal      = soma do gold do top 100 + gold fora do top (slider, padrão 0)
valorPorGold   = poolIndividual / goldTotal
ganhoJogador   = gold do jogador × valorPorGold
```

- **Guildas (suposição)**: a regra oficial não diz como os 6% são divididos. O padrão é proporcional ao GP (pontos de guilda), que é o que ordena o ranking oficial de guildas; a aba Guildas também permite dividir pelo gold dos membros no top 100.
- **Referral e bugs**: só o total de cada fatia (não há dados por jogador).
- **Classes**: `joinLevels` cruza o ranking de gold com o de nível pelo nick (sem diferenciar maiúsculas, com trim). Quem está no top de gold e fora do top 100 de nível fica como "classe desconhecida". `classStats` soma o ganho dos jogadores de cada classe com o mesmo cálculo da aba Jogadores, então as 4 classes (com a desconhecida) fecham com o total do ranking individual. Nível médio e máximo usam todo o top 100 de nível. Os dados cobrem só o topo, não o servidor inteiro.
- O código fica em `lib/calc.ts` (funções puras, testadas em `lib/calc.test.ts`).

## Estrutura

```
config.ts            URLs, endereços, percentuais, data de fim
lib/calc.ts          cálculos puros
lib/evermagic.ts     fetch e normalização dos endpoints do na-bridge
lib/chain.ts         leitura on-chain (viem)
lib/http.ts          fetch com User-Agent + cache em memória com fallback
lib/format.ts        números no formato brasileiro
app/api/*/route.ts   rotas do servidor
app/page.tsx         página (cliente)
app/components.tsx   seções da página
```

## Avisos

Site não oficial, sem vínculo com a Ever Magic. O ranking público mostra só o top 100, então os valores
tendem a ficar acima do real. Não é garantia de prêmio nem recomendação de investimento.

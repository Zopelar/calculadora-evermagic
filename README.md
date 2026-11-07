# Evermagic Prize Pool · calculadora não oficial

Mostra quanto cada jogador ganharia se a Season 0 Alpha do Evermagic acabasse agora:
pool total (USDT / EVA / R$), composição da pool on-chain (aporte, passes, poções), ranking com ganho
estimado em faixa, busca por nick, guildas, classes, simulador.

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
curl http://localhost:3000/api/composition
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
| Ranking de nível (top 100) | `GET na-bridge.evermagic.io/bridge/ranking/level` | Única fonte da classe (`knight`, `archer`, `mage`). Vem junto em `/api/ranking`, com o mesmo cache. Às vezes trava para o servidor da Vercel (timeout de 4 s); aí a página busca direto na fonte (CORS liberado). Usado na aba Classes, na coluna Classe da aba Jogadores e na busca. |
| Saldo da pool | Arbitrum One, `balanceOf` de EVA e USDT na carteira `0x139061180aDea785DD8A1a32e4A2B1188d2621A1` | Lido ao vivo via viem (multicall). Depois do fim da season fica travado no saldo do fechamento (`POOL_FINAL` em `config.ts`: 408,511 EVA no bloco 521.206.599), porque a carteira pagou a premiação em 06/11. O preço do EVA segue ao vivo. |
| Composição da pool | Arbitrum One, eventos `Transfer` do EVA para a carteira da pool (e saindo dela) | `/api/composition`. Lidos em janelas de 9.000.000 blocos (o RPC público aceita até 10.000.000 por `eth_getLogs`), no máximo 5 chamadas ao mesmo tempo, sem batch. Cada entrada é classificada em aporte, passes e poções. |
| Preço do EVA | `GET na-bridge.evermagic.io/bridge/eva/price?amount=1` | Mesma fonte da página evermagic.io/prizepool. |
| USDT → BRL | `api.coinbase.com/v2/exchange-rates?currency=USDT` | Opcional: se falhar, os valores em R$ aparecem como "—". A AwesomeAPI não é usada porque responde HTTP 429 para os IPs da Vercel. |

Endereços, URLs, percentuais da divisão, data de fim da season, preços do passe e da poção, aporte inicial e
fator do cenário provável ficam em [config.ts](config.ts).

### Cache e falhas

- As rotas `/api/ranking` e `/api/pool` buscam as fontes **pelo servidor**, guardam o resultado em memória por 5 minutos e respondem com `Cache-Control: s-maxage=300`, então a CDN da Vercel segura o tráfego e as fontes não são chamadas a cada visita.
- Se uma fonte falhar, o servidor devolve o último dado bom e o site mostra "dados de HH:MM".
- Depois de uma falha, a fonte só é tentada de novo após 1 minuto (não a cada visita).
- O navegador atualiza a cada 5 minutos.
- Requisições saem com o User-Agent `evermagic-pool-calc/1.0` (ajuste em `config.ts`).
- `/api/composition` tem cache de 10 minutos e leitura incremental: a 1ª chamada da instância lê todas as
  transferências desde o bloco 491.000.000 (~3 s); as seguintes leem só os blocos novos (mais ~2.000 blocos
  relidos por segurança, sem duplicar). Se entradas − saídas não fechar com o saldo, a próxima leitura é completa.
  O horário dos blocos (para o gráfico por dia) fica guardado e é consultado por bisseção, só o necessário
  para saber o dia de cada transferência.
- A página não espera por `/api/composition`: carrega com o cálculo de antes e a faixa aparece quando a
  composição chega. Se ela falhar, os ganhos ficam sem faixa (só o top 100), como antes.

### Quando cada fonte mudou

As fontes não são em tempo real, então o topo da página mostra quando cada uma mudou de verdade (não só
quando o site conferiu):

- **Pool (on-chain)**: horário do bloco da última compra.
- **Ranking de gold**: a API não informa data. O cache (`cached` em `lib/http.ts`) compara cada leitura
  com a anterior e guarda `sameSince` (1ª leitura com o conteúdo atual) e `changedAfter` (última leitura
  com o conteúdo antigo). Como fica em memória, depois que a instância reinicia o site mostra "nenhuma
  mudança vista ainda" até ver a próxima mudança.

## Cálculo

```
poolTotalUSDT  = saldoEVA × precoEVA + saldoUSDT
poolIndividual = poolTotalUSDT × 0,75
goldTotal      = soma do gold do top 100 + gold fora do top (slider; padrão = estimativa on-chain provável)
valorPorGold   = poolIndividual / goldTotal
ganhoJogador   = gold do jogador × valorPorGold
```

### Composição e faixa de ganho

Cada transferência de compra é `valor = 0,682·passes + 0,045·poções` (em wei, sem ponto flutuante), testando
de 0 a 20 passes. O aporte é a transferência de 250 EVA da carteira da equipe. Valor que não fecha em
nenhuma combinação aparece como "não identificada" no painel, assim como qualquer saída da carteira.

```
pagantesForaTop = max(0, passes vendidos − jogadores no ranking (100))   // supõe que todo o top 100 tem passe
gold100         = gold do 100º colocado
otimista        = poolIndividual / goldTop100                             // cálculo antigo
provável        = poolIndividual / (goldTop100 + pagantesForaTop × gold100 × 0,5)
pior caso       = poolIndividual / (goldTop100 + pagantesForaTop × gold100)
```

O valor em destaque é o provável; embaixo aparece a faixa entre o pior caso e o otimista. O slider do
simulador começa na estimativa provável e pode ser ajustado à mão ("Voltar para a estimativa" desfaz).
Funções puras em `lib/composition.ts` (classificação, paginação, leitura incremental) e `estimateOutside`
em `lib/calc.ts`, testadas em `lib/composition.test.ts` e `lib/calc.test.ts`.

- **Guildas (suposição)**: a regra oficial não diz como os 6% são divididos. O padrão é proporcional ao GP (pontos de guilda), que é o que ordena o ranking oficial de guildas; a aba Guildas também permite dividir pelo gold dos membros no top 100.
- **Referral e bugs**: só o total de cada fatia (não há dados por jogador).
- **Classes**: `joinLevels` cruza o ranking de gold com o de nível pelo nick (sem diferenciar maiúsculas, com trim). Quem está no top de gold e fora do top 100 de nível fica como "classe desconhecida". `classStats` soma o ganho dos jogadores de cada classe com o mesmo cálculo da aba Jogadores, então as 4 classes (com a desconhecida) fecham com o total do ranking individual. Nível médio e máximo usam todo o top 100 de nível. Os dados cobrem só o topo, não o servidor inteiro.
- O código fica em `lib/calc.ts` (funções puras, testadas em `lib/calc.test.ts`).

## Estrutura

```
config.ts            URLs, endereços, percentuais, data de fim
lib/calc.ts          cálculos puros
lib/composition.ts   classificação das transferências, paginação e leitura incremental (puro)
lib/evermagic.ts     fetch e normalização dos endpoints do na-bridge
lib/chain.ts         leitura on-chain (viem): saldos e transferências
lib/http.ts          fetch com User-Agent + cache em memória com fallback
lib/format.ts        números no formato brasileiro
app/api/*/route.ts   rotas do servidor
app/page.tsx         página (cliente)
app/components.tsx   seções da página
```

## Avisos

Site não oficial, sem vínculo com a Ever Magic. O ranking público mostra só o top 100 de gold; a faixa de
ganho é estimada pelos passes vendidos on-chain, supondo que todo o top 100 tem passe e que ninguém de fora
passa o 100º colocado. Compras feitas por fora da carteira da pool e jogadores no modo demo não entram na
conta. Não é garantia de prêmio nem recomendação de investimento.

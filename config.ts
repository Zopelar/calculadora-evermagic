// Tudo que pode mudar se as regras ou as fontes mudarem fica aqui.

// Término oficial: 04/11/2026 · 15:00 UTC (12:00 de Brasília). Pode ser estendida.
export const SEASON_END = '2026-11-04T15:00:00Z';

// Divisão da prize pool (Alpha Wiki / anúncio oficial).
export const SPLIT = {
  team: 0.1,
  individual: 0.75,
  guilds: 0.06,
  referral: 0.06,
  bugs: 0.03,
} as const;

// Endpoints usados pelo próprio evermagic.io (não há API pública oficial).
const BRIDGE = 'https://na-bridge.evermagic.io/bridge';
export const RANKING_GOLD_URL = `${BRIDGE}/ranking/gold`;
export const RANKING_GUILD_URL = `${BRIDGE}/ranking/guild`;
export const RANKING_LEVEL_URL = `${BRIDGE}/ranking/level`;
// Mesma fonte de preço da página evermagic.io/prizepool (preço de 1 EVA em USDT).
export const EVA_PRICE_URL = `${BRIDGE}/eva/price?amount=1`;
// Cotação de 1 USDT em R$ (Coinbase, sem chave). A AwesomeAPI responde HTTP 429 para os IPs
// compartilhados da Vercel, por isso não é usada.
export const USDT_BRL_URL = 'https://api.coinbase.com/v2/exchange-rates?currency=USDT';

// Arbitrum One (chainId 42161).
export const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
export const PRIZE_WALLET = '0x139061180aDea785DD8A1a32e4A2B1188d2621A1';
// Saldo da carteira no fim da season (bloco 521.206.599, 04/11/2026 15:00 UTC). Em 06/11 saíram
// 367,35 EVA para pagar a premiação; desde então a pool usa este saldo, não o ao vivo (o preço do EVA
// continua ao vivo). null = ler o saldo ao vivo (ex.: numa próxima season).
export const POOL_FINAL: { eva: number; usdt: number } | null = { eva: 408.511, usdt: 0 };
export const EVA_TOKEN = '0x45d9831d8751b2325f3dbf48db748723726e1c8c';
export const USDT_TOKEN = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

// Composição da pool (transferências de EVA para a carteira). Preços da Season 0 Alpha, em EVA:
// podem mudar numa próxima season.
export const EVA_DECIMALS = 18;
export const GAME_PASS_EVA = '0.682';
export const POTION_EVA = '0.045';
export const MAX_PASSES_PER_TRANSFER = 20; // a classificação testa de 0 a 20 passes por transferência
// Aporte inicial da equipe (05/10/2026).
export const SEED_EVA = '250';
export const SEED_FROM = '0x0ba41972b01cb03bdc2b6466c9d2ec9a1bfab01b';
// Leitura dos eventos Transfer: começa antes do aporte e anda em janelas abaixo do limite do RPC
// público (10.000.000 blocos por eth_getLogs), com no máximo 5 chamadas ao mesmo tempo.
export const POOL_FROM_BLOCK = 491_000_000;
export const LOGS_WINDOW_BLOCKS = 9_000_000;
export const RPC_CONCURRENCY = 5;
export const COMPOSITION_CACHE_SECONDS = 600;

// Cenário provável: cada pagante fora do top 100 tem, em média, esta fração do gold do 100º colocado.
export const OUTSIDE_LIKELY_FACTOR = 0.5;

// Carteira para doações (aceita só pela Arbitrum One). Vazio = a seção de doação não aparece no site.
export const DONATION_WALLET: string = '0xDD180205d742452aD9Cdfd0A312181C178B5b18A';
export const DONATION_TOKENS = 'EVA, USDT ou ETH';

export const CACHE_SECONDS = 300;
export const USER_AGENT = 'evermagic-pool-calc/1.0 (calculadora nao oficial da prize pool)';

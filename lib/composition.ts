import { formatUnits, isAddressEqual, parseUnits, type Address, type Hash } from 'viem';
import {
  EVA_DECIMALS,
  GAME_PASS_EVA,
  MAX_PASSES_PER_TRANSFER,
  POTION_EVA,
  SEED_EVA,
  SEED_FROM,
} from '../config';

// Composição da pool a partir das transferências de EVA para a carteira (funções puras; a leitura
// on-chain de verdade fica em lib/chain.ts). Valores em wei (bigint) para a conta fechar exata.

const ZERO = BigInt(0); // o tsconfig mira ES2017: sem literais 0n

// Uma transferência de EVA envolvendo a carteira da pool (evento Transfer do ERC-20).
export type PoolTransfer = { from: Address; to: Address; value: bigint; block: number; tx: Hash; logIndex: number };

export type Prices = { pass: bigint; potion: bigint; seed: bigint; seedFrom: Address; maxPasses: number };

export const PRICES: Prices = {
  pass: parseUnits(GAME_PASS_EVA, EVA_DECIMALS),
  potion: parseUnits(POTION_EVA, EVA_DECIMALS),
  seed: parseUnits(SEED_EVA, EVA_DECIMALS),
  seedFrom: SEED_FROM,
  maxPasses: MAX_PASSES_PER_TRANSFER,
};

export type TransferKind =
  | { kind: 'seed' }
  | { kind: 'purchase'; passes: number; potions: number }
  | { kind: 'unknown' };

// valor = passes × preço do passe + poções × preço da poção, testando de 0 a maxPasses passes.
// Com 0,682 e 0,045 a solução é única: 682 e 45 não têm fator comum, então dois números de passes
// que fecham a conta diferem de 45.
export function splitPurchase(value: bigint, p: Prices = PRICES): { passes: number; potions: number } | null {
  if (value <= ZERO) return null;
  for (let k = 0; k <= p.maxPasses; k++) {
    const rest = value - BigInt(k) * p.pass;
    if (rest < ZERO) break;
    if (rest % p.potion === ZERO) return { passes: k, potions: Number(rest / p.potion) };
  }
  return null;
}

export function classify(t: Pick<PoolTransfer, 'from' | 'value'>, p: Prices = PRICES): TransferKind {
  if (t.value === p.seed && isAddressEqual(t.from, p.seedFrom)) return { kind: 'seed' };
  const split = splitPurchase(t.value, p);
  return split ? { kind: 'purchase', ...split } : { kind: 'unknown' };
}

// Janelas [início, fim] de no máximo `size` blocos, do bloco mais novo para o mais antigo.
export function blockWindows(from: number, to: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let end = to; end >= from; end -= size) out.push([Math.max(from, end - size + 1), end]);
  return out;
}

// Executa no máximo `max` chamadas ao mesmo tempo; as outras esperam na fila.
export function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active < max) active++;
    else await new Promise<void>((resolve) => queue.push(resolve));
    try {
      return await fn();
    } finally {
      const next = queue.shift();
      if (next) next(); // passa a vaga direto para quem está esperando
      else active--;
    }
  };
}

export type ScanIO = {
  latestBlock: () => Promise<number>;
  transfers: (dir: 'in' | 'out', from: number, to: number) => Promise<PoolTransfer[]>;
  balanceAt: (block: number) => Promise<bigint>;
};
export type Scan = { block: number; in: PoolTransfer[]; out: PoolTransfer[]; balance: bigint };

const sumValues = (ts: PoolTransfer[]) => ts.reduce((s, t) => s + t.value, ZERO);

function merge(old: PoolTransfer[], fresh: PoolTransfer[]) {
  const byId = new Map(old.map((t) => [`${t.tx}:${t.logIndex}`, t]));
  for (const t of fresh) byId.set(`${t.tx}:${t.logIndex}`, t);
  return [...byId.values()].sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
}

// Leitura incremental. A 1ª chamada lê tudo desde `fromBlock`; as seguintes, só os blocos novos mais
// `overlap` blocos já lidos (um nó do RPC atrasado pode ter devolvido a última janela incompleta;
// duplicados são descartados). Se entradas − saídas não fechar com o saldo, a próxima refaz tudo.
export function createScanner(io: ScanIO, opts: { fromBlock: number; window: number; overlap: number }) {
  let state: Omit<Scan, 'balance'> | null = null;
  return async (): Promise<Scan> => {
    const base = state;
    const latest = Math.max(await io.latestBlock(), base?.block ?? 0); // nunca volta para trás
    const start = base ? Math.max(opts.fromBlock, base.block - opts.overlap + 1) : opts.fromBlock;
    const windows = blockWindows(start, latest, opts.window);
    const read = (dir: 'in' | 'out') =>
      Promise.all(windows.map(([a, b]) => io.transfers(dir, a, b))).then((r) => r.flat());
    const [incoming, outgoing, balance] = await Promise.all([read('in'), read('out'), io.balanceAt(latest)]);
    const next = { block: latest, in: merge(base?.in ?? [], incoming), out: merge(base?.out ?? [], outgoing) };
    state = sumValues(next.in) - sumValues(next.out) === balance ? next : null;
    return { ...next, balance };
  };
}

// 'AAAA-MM-DD' no horário de Brasília.
const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const dayKey = (unixSeconds: number) => dayFmt.format(unixSeconds * 1000);

// Dia de cada bloco consultando o mínimo de horários: o horário nunca diminui de um bloco para o
// seguinte, então se o primeiro e o último de um trecho caem no mesmo dia, todos no meio também caem.
export async function daysOfBlocks(blocks: number[], dayOf: (block: number) => Promise<string>) {
  const sorted = [...new Set(blocks)].sort((a, b) => a - b);
  const days = new Map<number, string>();
  const get = async (i: number) => {
    const d = await dayOf(sorted[i]);
    days.set(sorted[i], d);
    return d;
  };
  const fill = async (lo: number, hi: number, dLo: string, dHi: string): Promise<void> => {
    if (dLo === dHi) {
      for (let i = lo + 1; i < hi; i++) days.set(sorted[i], dLo);
      return;
    }
    if (hi - lo < 2) return;
    const mid = (lo + hi) >> 1;
    const dMid = await get(mid);
    await Promise.all([fill(lo, mid, dLo, dMid), fill(mid, hi, dMid, dHi)]);
  };
  if (sorted.length) {
    const last = sorted.length - 1;
    const [first, end] = await Promise.all([get(0), get(last)]);
    await fill(0, last, first, end);
  }
  return days;
}

// Total de um tipo: `count` é a quantidade de itens (passes, poções) ou de transferências (aporte,
// não identificadas, saídas).
export type Tally = { count: number; eva: number };
export type DailyIn = { day: string; passes: number; potions: number; passesEva: number; potionsEva: number };

export type Composition = {
  block: number; // último bloco lido
  balanceEva: number; // saldo de EVA da carteira nesse bloco
  balanced: boolean; // entradas − saídas = saldo (conta exata, em wei)
  transfersIn: number;
  seed: Tally;
  passes: Tally;
  potions: Tally;
  unknown: Tally;
  outgoing: Tally;
  passBuyers: number; // carteiras distintas com pelo menos 1 passe
  batchBuyers: number; // carteiras com mais de 1 passe (compra em lote)
  batchPasses: number; // passes dessas carteiras
  daily: DailyIn[]; // entradas de compras por dia (Brasília), sem buracos entre o 1º e o último dia
};

const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function summarize(scan: Scan, days: Map<number, string>, p: Prices = PRICES): Composition {
  const eva = (wei: bigint) => Number(formatUnits(wei, EVA_DECIMALS));
  const tally = () => ({ count: 0, wei: ZERO });
  const seed = tally();
  const passes = tally();
  const potions = tally();
  const unknown = tally();
  const byWallet = new Map<string, number>();
  const byDay = new Map<string, { passes: number; potions: number }>();
  for (const t of scan.in) {
    const c = classify(t, p);
    if (c.kind === 'seed' || c.kind === 'unknown') {
      const x = c.kind === 'seed' ? seed : unknown;
      x.count++;
      x.wei += t.value;
      continue;
    }
    passes.count += c.passes;
    passes.wei += BigInt(c.passes) * p.pass;
    potions.count += c.potions;
    potions.wei += BigInt(c.potions) * p.potion;
    if (c.passes > 0) {
      const wallet = t.from.toLowerCase();
      byWallet.set(wallet, (byWallet.get(wallet) ?? 0) + c.passes);
    }
    const day = days.get(t.block);
    if (day) {
      const d = byDay.get(day) ?? { passes: 0, potions: 0 };
      d.passes += c.passes;
      d.potions += c.potions;
      byDay.set(day, d);
    }
  }
  const outWei = scan.out.reduce((s, t) => s + t.value, ZERO);
  const inWei = scan.in.reduce((s, t) => s + t.value, ZERO);

  const daily: DailyIn[] = [];
  const keys = [...byDay.keys()].sort();
  for (let day = keys[0]; keys.length && day <= keys[keys.length - 1]; day = nextDay(day)) {
    const d = byDay.get(day) ?? { passes: 0, potions: 0 };
    daily.push({
      day,
      ...d,
      passesEva: eva(BigInt(d.passes) * p.pass),
      potionsEva: eva(BigInt(d.potions) * p.potion),
    });
  }

  const batch = [...byWallet.values()].filter((n) => n > 1);
  const out = (x: { count: number; wei: bigint }): Tally => ({ count: x.count, eva: eva(x.wei) });
  return {
    block: scan.block,
    balanceEva: eva(scan.balance),
    balanced: inWei - outWei === scan.balance,
    transfersIn: scan.in.length,
    seed: out(seed),
    passes: out(passes),
    potions: out(potions),
    unknown: out(unknown),
    outgoing: { count: scan.out.length, eva: eva(outWei) },
    passBuyers: byWallet.size,
    batchBuyers: batch.length,
    batchPasses: batch.reduce((s, n) => s + n, 0),
    daily,
  };
}

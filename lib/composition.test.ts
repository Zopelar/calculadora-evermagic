import { parseUnits, type Address, type Hash } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import {
  blockWindows,
  classify,
  createScanner,
  dayKey,
  daysOfBlocks,
  limiter,
  PRICES,
  splitPurchase,
  summarize,
  type PoolTransfer,
  type ScanIO,
} from './composition';

const eva = (s: string) => parseUnits(s, 18);
const SEED_FROM = PRICES.seedFrom;
const PLAYER = '0x00000000000000000000000000000000000000a1' as Address;
const POOL = '0x139061180aDea785DD8A1a32e4A2B1188d2621A1' as Address;

let n = 0;
const transfer = (value: string, extra: Partial<PoolTransfer> = {}): PoolTransfer => ({
  from: PLAYER,
  to: POOL,
  value: eva(value),
  block: 100,
  tx: `0x${(++n).toString(16).padStart(64, '0')}` as Hash,
  logIndex: 0,
  ...extra,
});

describe('splitPurchase / classify', () => {
  it.each([
    ['0.682', 1, 0],
    ['0.045', 0, 1],
    ['1.132', 1, 10],
    ['5.456', 8, 0],
    ['2.25', 0, 50],
    ['1.364', 2, 0],
    ['0.45', 0, 10],
  ])('%s EVA = %i passe(s) + %i poção(ões)', (value, passes, potions) => {
    expect(splitPurchase(eva(value))).toEqual({ passes, potions });
    expect(classify(transfer(value))).toEqual({ kind: 'purchase', passes, potions });
  });

  it.each([['1'], ['0.6821'], ['0.682000000000000001'], ['0'], ['0.044']])(
    'valor que não fecha em nenhuma combinação (%s EVA) é não identificado',
    (value) => {
      expect(splitPurchase(eva(value))).toBeNull();
      expect(classify(transfer(value))).toEqual({ kind: 'unknown' });
    },
  );

  it('testa só até 20 passes por transferência (30 passes não é identificado)', () => {
    expect(splitPurchase(eva('13.64'))).toEqual({ passes: 20, potions: 0 });
    expect(splitPurchase(eva('20.46'))).toBeNull();
  });

  it('aporte: 250 EVA vindos da carteira da equipe (endereço sem diferenciar maiúsculas)', () => {
    expect(classify(transfer('250', { from: SEED_FROM.toUpperCase().replace('0X', '0x') as Address }))).toEqual({
      kind: 'seed',
    });
    expect(classify(transfer('250')).kind).not.toBe('seed');
    expect(classify(transfer('100', { from: SEED_FROM })).kind).not.toBe('seed');
  });
});

describe('blockWindows (paginação do eth_getLogs)', () => {
  it('cobre o intervalo inteiro, do mais novo para o mais antigo, sem buraco nem sobreposição', () => {
    const w = blockWindows(491_000_000, 518_645_000, 9_000_000);
    expect(w).toEqual([
      [509_645_001, 518_645_000],
      [500_645_001, 509_645_000],
      [491_645_001, 500_645_000],
      [491_000_000, 491_645_000],
    ]);
    for (const [a, b] of w) expect(b - a + 1).toBeLessThanOrEqual(9_000_000);
    for (let i = 1; i < w.length; i++) expect(w[i][1]).toBe(w[i - 1][0] - 1);
  });

  it('intervalo de 1 bloco vira 1 janela; intervalo vazio não gera janela', () => {
    expect(blockWindows(10, 10, 9_000_000)).toEqual([[10, 10]]);
    expect(blockWindows(11, 10, 9_000_000)).toEqual([]);
  });
});

describe('limiter', () => {
  it('nunca passa do máximo de chamadas simultâneas e devolve cada resultado', async () => {
    const limit = limiter(2);
    let active = 0;
    let peak = 0;
    const task = (i: number) =>
      limit(async () => {
        peak = Math.max(peak, ++active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return i;
      });
    expect(await Promise.all([1, 2, 3, 4, 5, 6].map(task))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(peak).toBe(2);
  });

  it('erro numa chamada libera a vaga', async () => {
    const limit = limiter(1);
    await expect(limit(async () => Promise.reject(new Error('429')))).rejects.toThrow('429');
    expect(await limit(async () => 'ok')).toBe('ok');
  });
});

describe('createScanner (leitura incremental)', () => {
  function fakeChain() {
    const chain = { latest: 1_000, in: [] as PoolTransfer[], out: [] as PoolTransfer[] };
    const io: ScanIO = {
      latestBlock: vi.fn(async () => chain.latest),
      transfers: vi.fn(async (dir: 'in' | 'out', from: number, to: number) =>
        chain[dir].filter((t) => t.block >= from && t.block <= to),
      ),
      balanceAt: vi.fn(async (block: number) => {
        const sum = (ts: PoolTransfer[]) => ts.filter((t) => t.block <= block).reduce((s, t) => s + t.value, BigInt(0));
        return sum(chain.in) - sum(chain.out);
      }),
    };
    return { chain, io };
  }
  const opts = { fromBlock: 0, window: 400, overlap: 50 };

  it('1ª leitura vai do bloco inicial até o atual em janelas; depois só os blocos novos', async () => {
    const { chain, io } = fakeChain();
    chain.in.push(transfer('250', { from: SEED_FROM, block: 10 }), transfer('0.682', { block: 900 }));
    const scan = createScanner(io, opts);

    const first = await scan();
    expect(first).toMatchObject({ block: 1_000, balance: eva('250.682') });
    expect(first.in).toHaveLength(2);
    expect(vi.mocked(io.transfers).mock.calls.filter(([d]) => d === 'in').map(([, a, b]) => [a, b])).toEqual([
      [601, 1_000],
      [201, 600],
      [0, 200],
    ]);

    vi.mocked(io.transfers).mockClear();
    chain.latest = 1_200;
    chain.in.push(transfer('0.045', { block: 1_100 }));
    const second = await scan();
    // relê 50 blocos já lidos (951–1000) por segurança, sem duplicar
    expect(vi.mocked(io.transfers).mock.calls.map(([d, a, b]) => [d, a, b])).toEqual([
      ['in', 951, 1_200],
      ['out', 951, 1_200],
    ]);
    expect(second.in.map((t) => t.block)).toEqual([10, 900, 1_100]);
    expect(second.balance).toBe(eva('250.727'));
  });

  it('transferência que chegou atrasada na margem relida entra uma vez só', async () => {
    const { chain, io } = fakeChain();
    chain.in.push(transfer('0.682', { block: 500 }));
    const scan = createScanner(io, opts);
    await scan();
    chain.in.push(transfer('0.045', { block: 980 })); // nó do RPC estava atrasado na 1ª leitura
    chain.latest = 1_010;
    const r = await scan();
    expect(r.in.map((t) => t.block)).toEqual([500, 980]);
  });

  it('se entradas − saídas não bate com o saldo, a próxima leitura é completa', async () => {
    const { chain, io } = fakeChain();
    chain.in.push(transfer('0.682', { block: 500 }));
    vi.mocked(io.balanceAt).mockResolvedValueOnce(eva('999'));
    const scan = createScanner(io, opts);
    await scan();
    vi.mocked(io.transfers).mockClear();
    await scan();
    expect(vi.mocked(io.transfers).mock.calls.some(([, from]) => from === 0)).toBe(true);
  });

  it('lê também as saídas da carteira', async () => {
    const { chain, io } = fakeChain();
    chain.in.push(transfer('250', { from: SEED_FROM, block: 10 }));
    chain.out.push(transfer('5', { from: POOL, to: PLAYER, block: 20 }));
    const r = await createScanner(io, opts)();
    expect(r.out).toHaveLength(1);
    expect(r.balance).toBe(eva('245'));
  });
});

describe('dayKey / daysOfBlocks', () => {
  it('agrupa pelo dia de Brasília', () => {
    expect(dayKey(Date.parse('2026-10-05T17:28:41Z') / 1000)).toBe('2026-10-05');
    expect(dayKey(Date.parse('2026-10-06T02:59:59Z') / 1000)).toBe('2026-10-05'); // 23:59 em Brasília
    expect(dayKey(Date.parse('2026-10-06T03:00:00Z') / 1000)).toBe('2026-10-06');
  });

  it('acerta o dia de todos os blocos consultando bem menos horários que blocos', async () => {
    const blocks = Array.from({ length: 200 }, (_, i) => 1_000 + i * 7);
    const day = (b: number) => `2026-10-${String(5 + Math.floor((b - 1_000) / 300)).padStart(2, '0')}`;
    const dayOf = vi.fn(async (b: number) => day(b));
    const days = await daysOfBlocks([...blocks].reverse().concat(blocks[3]), dayOf);
    expect(days.size).toBe(200);
    for (const b of blocks) expect(days.get(b), String(b)).toBe(day(b));
    expect(dayOf.mock.calls.length).toBeLessThan(60);
  });

  it('sem blocos não consulta nada', async () => {
    const dayOf = vi.fn(async () => 'x');
    expect((await daysOfBlocks([], dayOf)).size).toBe(0);
    expect(dayOf).not.toHaveBeenCalled();
  });
});

describe('summarize', () => {
  // Distribuição real das 247 entradas até 27/10/2026 ~01h40 (só valor e quantidade).
  const REAL: [string, number][] = [
    ['0.682', 91], ['0.045', 62], ['0.45', 32], ['0.09', 13], ['0.9', 7], ['0.18', 6], ['1.364', 5],
    ['0.225', 5], ['0.36', 4], ['0.315', 3], ['0.135', 3], ['0.54', 3], ['2.046', 2], ['1.042', 1],
    ['4.774', 1], ['4.092', 1], ['0.727', 1], ['1.132', 1], ['0.27', 1], ['3.41', 1], ['5.456', 1],
    ['2.25', 1], ['0.675', 1],
  ];

  it('snapshot real: aporte + passes + poções fecha exatamente com o saldo de 378,077 EVA', () => {
    const ins = [
      transfer('250', { from: SEED_FROM }),
      ...REAL.flatMap(([v, count]) => Array.from({ length: count }, () => transfer(v))),
    ];
    const c = summarize({ block: 1, in: ins, out: [], balance: eva('378.077') }, new Map());
    expect(c.transfersIn).toBe(247);
    expect(c.seed).toEqual({ count: 1, eva: 250 });
    expect(c.passes).toEqual({ count: 136, eva: 92.752 });
    expect(c.potions).toEqual({ count: 785, eva: 35.325 });
    expect(c.unknown).toEqual({ count: 0, eva: 0 });
    expect(c.balanced).toBe(true);
    expect(c.balanceEva).toBe(378.077);
  });

  it('soma das categorias bate com o saldo; saída e não identificada aparecem', () => {
    const ins = [
      transfer('250', { from: SEED_FROM }),
      transfer('1.132', { block: 200 }),
      transfer('0.0001', { block: 200 }),
    ];
    const out = [transfer('1', { from: POOL, to: PLAYER })];
    const c = summarize({ block: 300, in: ins, out, balance: eva('250.1321') }, new Map());
    expect(c).toMatchObject({
      balanced: true,
      unknown: { count: 1, eva: 0.0001 },
      outgoing: { count: 1, eva: 1 },
      passes: { count: 1 },
      potions: { count: 10 },
    });
    expect(c.seed.eva + c.passes.eva + c.potions.eva + c.unknown.eva - c.outgoing.eva).toBeCloseTo(c.balanceEva, 9);
    expect(summarize({ block: 300, in: ins, out, balance: eva('251') }, new Map()).balanced).toBe(false);
  });

  it('conta carteiras distintas com passe e as que compraram mais de um', () => {
    const a = '0x00000000000000000000000000000000000000aa' as Address;
    const b = '0x00000000000000000000000000000000000000bb' as Address;
    const ins = [
      transfer('0.682', { from: a }),
      transfer('0.682', { from: b }),
      transfer('1.364', { from: b.toUpperCase().replace('0X', '0x') as Address }),
      transfer('0.45'), // só poções: não conta como comprador de passe
    ];
    const c = summarize({ block: 1, in: ins, out: [], balance: eva('3.178') }, new Map());
    expect(c).toMatchObject({ passBuyers: 2, batchBuyers: 1, batchPasses: 3 });
  });

  it('bloco da última compra ignora aporte e transferência não identificada', () => {
    const ins = [
      transfer('0.682', { block: 50 }),
      transfer('0.045', { block: 70 }),
      transfer('250', { from: SEED_FROM, block: 80 }),
      transfer('0.0001', { block: 90 }),
    ];
    const c = summarize({ block: 100, in: ins, out: [], balance: eva('250.7271') }, new Map());
    expect(c).toMatchObject({ lastPurchaseBlock: 70, lastPurchaseAt: null });
    expect(summarize({ block: 1, in: [], out: [], balance: BigInt(0) }, new Map()).lastPurchaseBlock).toBeNull();
  });

  it('entradas por dia sem o aporte e com os dias sem compra preenchidos com zero', () => {
    const ins = [
      transfer('250', { from: SEED_FROM, block: 1 }),
      transfer('0.682', { block: 2 }),
      transfer('0.45', { block: 3 }),
      transfer('1.364', { block: 4 }),
    ];
    const days = new Map([
      [1, '2026-10-30'],
      [2, '2026-10-30'],
      [3, '2026-10-30'],
      [4, '2026-11-02'],
    ]);
    const c = summarize({ block: 4, in: ins, out: [], balance: eva('252.496') }, days);
    expect(c.daily).toEqual([
      { day: '2026-10-30', passes: 1, potions: 10, passesEva: 0.682, potionsEva: 0.45 },
      { day: '2026-10-31', passes: 0, potions: 0, passesEva: 0, potionsEva: 0 },
      { day: '2026-11-01', passes: 0, potions: 0, passesEva: 0, potionsEva: 0 },
      { day: '2026-11-02', passes: 2, potions: 0, passesEva: 1.364, potionsEva: 0 },
    ]);
  });
});

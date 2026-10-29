import { createPublicClient, erc20Abi, formatUnits, http } from 'viem';
import { arbitrum } from 'viem/chains';
import {
  EVA_TOKEN,
  LOGS_WINDOW_BLOCKS,
  POOL_FROM_BLOCK,
  PRIZE_WALLET,
  RPC_CONCURRENCY,
  RPC_URL,
  USDT_TOKEN,
} from '../config';
import {
  createScanner,
  dayKey,
  daysOfBlocks,
  limiter,
  summarize,
  type Composition,
  type PoolTransfer,
} from './composition';

// Sem batch (o RPC público não aceita bem); o viem já refaz a chamada (3×, com espera crescente) em
// erro de rede, 429 e 5xx.
const client = createPublicClient({ chain: arbitrum, transport: http(RPC_URL, { timeout: 10_000 }) });

// Saldos de EVA e USDT da carteira da prize pool, numa única chamada (multicall).
export async function readPoolBalances() {
  const [evaRaw, evaDecimals, usdtRaw, usdtDecimals] = await client.multicall({
    allowFailure: false,
    contracts: [
      { address: EVA_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [PRIZE_WALLET] },
      { address: EVA_TOKEN, abi: erc20Abi, functionName: 'decimals' },
      { address: USDT_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [PRIZE_WALLET] },
      { address: USDT_TOKEN, abi: erc20Abi, functionName: 'decimals' },
    ],
  });
  return {
    eva: Number(formatUnits(evaRaw, evaDecimals)),
    usdt: Number(formatUnits(usdtRaw, usdtDecimals)),
  };
}

const limit = limiter(RPC_CONCURRENCY); // vale para todas as chamadas da composição
const OVERLAP_BLOCKS = 2_000; // ~10 min de Arbitrum relidos a cada atualização

async function transfers(dir: 'in' | 'out', from: number, to: number): Promise<PoolTransfer[]> {
  const range = { fromBlock: BigInt(from), toBlock: BigInt(to) };
  const query = { address: EVA_TOKEN, abi: erc20Abi, eventName: 'Transfer', strict: true, ...range } as const;
  const logs = await limit(() =>
    dir === 'in'
      ? client.getContractEvents({ ...query, args: { to: PRIZE_WALLET } })
      : client.getContractEvents({ ...query, args: { from: PRIZE_WALLET } }),
  );
  return logs.map((l) => ({
    from: l.args.from,
    to: l.args.to,
    value: l.args.value,
    block: Number(l.blockNumber),
    tx: l.transactionHash,
    logIndex: l.logIndex,
  }));
}

// Estado em memória por instância: a 1ª leitura pega tudo, as seguintes só os blocos novos.
const scanPool = createScanner(
  {
    latestBlock: () => limit(() => client.getBlockNumber({ cacheTime: 0 })).then(Number),
    transfers,
    balanceAt: (block) =>
      limit(() =>
        client.readContract({
          address: EVA_TOKEN,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [PRIZE_WALLET],
          blockNumber: BigInt(block),
        }),
      ),
  },
  { fromBlock: POOL_FROM_BLOCK, window: LOGS_WINDOW_BLOCKS, overlap: OVERLAP_BLOCKS },
);

// O horário de um bloco não muda: fica guardado enquanto a instância viver (falha não fica guardada).
const blockTimes = new Map<number, Promise<number>>();
function timestampOf(block: number) {
  let t = blockTimes.get(block);
  if (!t) {
    t = limit(() => client.getBlock({ blockNumber: BigInt(block) })).then((b) => Number(b.timestamp));
    t.catch(() => blockTimes.delete(block));
    blockTimes.set(block, t);
  }
  return t;
}

export async function readComposition(): Promise<Composition> {
  const scan = await scanPool();
  const days = await daysOfBlocks(
    scan.in.map((t) => t.block),
    async (block) => dayKey(await timestampOf(block)),
  );
  const c = summarize(scan, days);
  // em geral é o bloco mais novo da lista acima, com o horário já guardado (sem chamada extra)
  const lastPurchaseAt = c.lastPurchaseBlock === null ? null : (await timestampOf(c.lastPurchaseBlock)) * 1000;
  return { ...c, lastPurchaseAt };
}

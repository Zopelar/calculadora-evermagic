import { createPublicClient, erc20Abi, formatUnits, http } from 'viem';
import { arbitrum } from 'viem/chains';
import { EVA_TOKEN, PRIZE_WALLET, RPC_URL, USDT_TOKEN } from '../config';

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

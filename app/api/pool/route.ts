import { USDT_BRL_URL } from '@/config';
import { readPoolBalances } from '@/lib/chain';
import { fetchEvaPrice } from '@/lib/evermagic';
import { CACHE_HEADERS, cached, getJson } from '@/lib/http';
import { connection } from 'next/server';

// Cotação de 1 USDT em R$.
async function fetchUsdtBrl() {
  const { data } = await getJson<{ data?: { rates?: { BRL?: string } } }>(USDT_BRL_URL);
  const n = Number(data?.rates?.BRL);
  if (!(n > 0)) throw new Error(`cotação USDT-BRL inválida: ${data?.rates?.BRL}`);
  return n;
}

export async function GET() {
  await connection(); // nunca pré-renderizar no build: o cache é em memória (lib/http.ts)
  try {
    const [balances, evaPrice, usdBrl] = await Promise.all([
      cached('pool/balances', readPoolBalances),
      cached('pool/evaPrice', fetchEvaPrice),
      // a cotação em R$ é complementar: se falhar, a pool sai sem os valores em reais
      cached('pool/usdBrl', fetchUsdtBrl).catch((err) => {
        console.error(err);
        return null;
      }),
    ]);
    return Response.json(
      {
        ...balances.data,
        evaPrice: evaPrice.data.price,
        evaPriceAt: evaPrice.data.updatedAt, // quando a fonte atualizou o preço
        usdBrl: usdBrl?.data ?? null,
        updatedAt: Math.min(balances.at, evaPrice.at),
        stale: balances.stale || evaPrice.stale,
      },
      { headers: CACHE_HEADERS },
    );
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Dados da prize pool indisponíveis' }, { status: 502 });
  }
}

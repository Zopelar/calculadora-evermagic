import { COMPOSITION_CACHE_SECONDS } from '@/config';
import { readComposition } from '@/lib/chain';
import { cacheHeaders, cached } from '@/lib/http';
import { connection } from 'next/server';

// Composição da pool (aporte, passes, poções) a partir das transferências de EVA na Arbitrum.
// Rota separada de /api/pool: a página carrega sem esperar por ela.
export async function GET() {
  await connection(); // nunca pré-renderizar no build: o cache é em memória (lib/http.ts)
  try {
    const c = await cached('composition', readComposition, COMPOSITION_CACHE_SECONDS);
    return Response.json(
      { ...c.data, updatedAt: c.at, stale: c.stale },
      { headers: cacheHeaders(COMPOSITION_CACHE_SECONDS) },
    );
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Composição on-chain da pool indisponível' }, { status: 502 });
  }
}

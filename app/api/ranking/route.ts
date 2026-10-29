import { fetchGoldRanking, fetchGuildRanking, fetchLevelRanking } from '@/lib/evermagic';
import { CACHE_HEADERS, cached } from '@/lib/http';
import { connection } from 'next/server';

const logNull = (err: unknown) => {
  console.error(err);
  return null;
};

export async function GET() {
  await connection(); // nunca pré-renderizar no build: o cache é em memória (lib/http.ts)
  try {
    const [gold, guilds, levels] = await Promise.all([
      cached('ranking/gold', fetchGoldRanking),
      // guildas e nível são complementares: se falharem, o ranking de gold ainda sai
      cached('ranking/guild', fetchGuildRanking).catch(logNull),
      cached('ranking/level', fetchLevelRanking).catch(logNull),
    ]);
    return Response.json(
      {
        players: gold.data,
        guilds: guilds?.data ?? [],
        levels: levels?.data ?? [],
        updatedAt: gold.at,
        // a API não informa quando o ranking muda: é a leitura em que vimos o ranking de gold diferente
        sameSince: gold.sameSince,
        changedAfter: gold.changedAfter,
        stale: gold.stale,
      },
      { headers: CACHE_HEADERS },
    );
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Ranking do Evermagic indisponível' }, { status: 502 });
  }
}

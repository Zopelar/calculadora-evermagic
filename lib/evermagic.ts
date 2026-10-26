import { EVA_PRICE_URL, RANKING_GOLD_URL, RANKING_GUILD_URL, RANKING_LEVEL_URL } from '../config';
import type { GuildInfo, Player, PlayerLevel } from './calc';
import { getJson } from './http';

async function getRanking<T>(url: string): Promise<T[]> {
  const { ranking } = await getJson<{ ranking: T[] }>(url);
  if (!Array.isArray(ranking)) throw new Error(`${url}: formato inesperado`);
  return ranking;
}

export async function fetchGoldRanking(): Promise<Player[]> {
  const ranking = await getRanking<Player>(RANKING_GOLD_URL);
  return ranking.map((p) => ({ player: String(p.player), guild: p.guild || null, gold: Number(p.gold) || 0 }));
}

export async function fetchGuildRanking(): Promise<GuildInfo[]> {
  const ranking = await getRanking<GuildInfo>(RANKING_GUILD_URL);
  return ranking.map((g) => ({
    guild: String(g.guild),
    level: Number(g.level) || 0,
    gp: Number(g.gp) || 0,
    members: Number(g.members) || 0,
  }));
}

export async function fetchLevelRanking(): Promise<PlayerLevel[]> {
  const ranking = await getRanking<PlayerLevel>(RANKING_LEVEL_URL);
  return ranking.map((p) => ({
    player: String(p.player),
    class: String(p.class),
    guild: p.guild || null,
    level: Number(p.level) || 0,
  }));
}

// Preço de 1 EVA em USDT, mesma fonte da página oficial da prize pool.
export async function fetchEvaPrice(): Promise<number> {
  const { price } = await getJson<{ price: string }>(EVA_PRICE_URL);
  const n = Number(price);
  if (!(n > 0)) throw new Error(`preço do EVA inválido: ${price}`);
  return n;
}

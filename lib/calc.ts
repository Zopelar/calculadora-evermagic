import { SPLIT } from '../config';

export type Player = { player: string; guild: string | null; gold: number };
export type GuildInfo = { guild: string; level: number; gp: number; members: number };
export type PlayerLevel = { player: string; class: string; guild: string | null; level: number };
export type PoolData = { eva: number; usdt: number; evaPrice: number; usdBrl: number | null }; // null = cotação indisponível

export type RankedPlayer = Player & {
  rank: number;
  share: number; // fração do gold total
  usdt: number; // ganho estimado
  toNext: number | null; // gold que falta para passar o jogador de cima
};

export type GuildRow = {
  guild: string;
  level?: number;
  gp?: number;
  members?: number; // total na guilda (ranking oficial de guildas)
  topMembers: number; // membros no top 100 de gold
  topGold: number;
  share: number;
  usdt: number;
};

export function poolSlices({ eva, usdt, evaPrice }: PoolData) {
  const totalUsdt = eva * evaPrice + usdt;
  return {
    totalUsdt,
    totalEva: totalUsdt / evaPrice,
    individual: totalUsdt * SPLIT.individual,
    guilds: totalUsdt * SPLIT.guilds,
    referral: totalUsdt * SPLIT.referral,
    bugs: totalUsdt * SPLIT.bugs,
    team: totalUsdt * SPLIT.team,
  };
}

export type Slices = ReturnType<typeof poolSlices>;

export const totalGold =(players: Player[], outsideTop = 0) =>
  players.reduce((sum, p) => sum + p.gold, 0) + outsideTop;

export const valuePerGold = (individualUsdt: number, goldTotal: number) =>
  goldTotal > 0 ? individualUsdt / goldTotal : 0;

export function rankPlayers(players: Player[], individualUsdt: number, goldTotal: number): RankedPlayer[] {
  const perGold = valuePerGold(individualUsdt, goldTotal);
  const sorted = [...players].sort((a, b) => b.gold - a.gold);
  return sorted.map((p, i) => ({
    ...p,
    rank: i + 1,
    share: goldTotal > 0 ? p.gold / goldTotal : 0,
    usdt: p.gold * perGold,
    toNext: i === 0 ? null : sorted[i - 1].gold - p.gold + 1,
  }));
}

// Posição que um jogador com `gold` ocuparia no ranking.
export const rankFor = (players: Player[], gold: number) => players.filter((p) => p.gold > gold).length + 1;

// Suposição: a regra oficial não diz como os 6% de guildas são divididos.
// 'gp' = proporcional aos pontos de guilda (padrão no site: é o que ordena o ranking oficial);
// 'gold' = proporcional ao gold dos membros no top 100.
export function guildShares(
  players: Player[],
  guilds: GuildInfo[],
  guildPoolUsdt: number,
  basis: 'gold' | 'gp',
): GuildRow[] {
  const rows = new Map<string, GuildRow>();
  const row = (name: string) => {
    if (!rows.has(name)) rows.set(name, { guild: name, topMembers: 0, topGold: 0, share: 0, usdt: 0 });
    return rows.get(name)!;
  };
  for (const g of guilds) Object.assign(row(g.guild), { level: g.level, gp: g.gp, members: g.members });
  for (const p of players) {
    if (!p.guild) continue;
    const r = row(p.guild);
    r.topMembers++;
    r.topGold += p.gold;
  }
  const weight = (r: GuildRow) => (basis === 'gp' ? (r.gp ?? 0) : r.topGold);
  const total = [...rows.values()].reduce((sum, r) => sum + weight(r), 0);
  for (const r of rows.values()) {
    r.share = total > 0 ? weight(r) / total : 0;
    r.usdt = guildPoolUsdt * r.share;
  }
  return [...rows.values()].sort((a, b) => b.share - a.share || b.topGold - a.topGold);
}

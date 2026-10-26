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

export type PlayerClass = 'knight' | 'archer' | 'mage';
export type ClassKey = PlayerClass | 'unknown';
export const PLAYER_CLASSES: PlayerClass[] = ['knight', 'archer', 'mage'];

// Jogador do top de gold com classe e nível vindos do ranking de nível ('unknown' se estiver fora dele).
export type ClassedPlayer = RankedPlayer & { cls: ClassKey; level: number | null; levelRank: number | null };

export type ClassStats = {
  cls: ClassKey;
  goldPlayers: number; // jogadores no top 100 de gold
  levelPlayers: number; // jogadores no top 100 de nível
  gold: number;
  avgGold: number; // por jogador do top de gold
  goldShare: number; // fração do gold do top 100
  usdt: number; // soma do ganho estimado dos jogadores (mesmo cálculo da aba Jogadores)
  avgUsdt: number;
  avgLevel: number | null; // do top 100 de nível
  maxLevel: number | null;
  best: ClassedPlayer | null; // maior gold da classe
};

const nickKey = (nick: string) => nick.trim().toLowerCase();
const classOf = (raw: string): ClassKey => {
  const c = raw.trim().toLowerCase();
  return (PLAYER_CLASSES as string[]).includes(c) ? (c as PlayerClass) : 'unknown';
};

export function joinLevels(rows: RankedPlayer[], levels: PlayerLevel[]): ClassedPlayer[] {
  const byNick = new Map<string, PlayerLevel & { levelRank: number }>();
  [...levels]
    .sort((a, b) => b.level - a.level)
    .forEach((l, i) => {
      const key = nickKey(l.player);
      if (!byNick.has(key)) byNick.set(key, { ...l, levelRank: i + 1 });
    });
  return rows.map((r) => {
    const l = byNick.get(nickKey(r.player));
    return { ...r, cls: l ? classOf(l.class) : 'unknown', level: l?.level ?? null, levelRank: l?.levelRank ?? null };
  });
}

// As 3 classes ordenadas pelo ganho total, e a 'unknown' por último (para os totais fecharem com a pool).
export function classStats(players: ClassedPlayer[], levels: PlayerLevel[]): ClassStats[] {
  const top100 = totalGold(players);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const stats = (cls: ClassKey): ClassStats => {
    const mine = players.filter((p) => p.cls === cls);
    const lv = levels.filter((l) => classOf(l.class) === cls && cls !== 'unknown').map((l) => l.level);
    const gold = sum(mine.map((p) => p.gold));
    const usdt = sum(mine.map((p) => p.usdt));
    const n = mine.length;
    return {
      cls,
      goldPlayers: n,
      levelPlayers: lv.length,
      gold,
      avgGold: n ? gold / n : 0,
      goldShare: top100 > 0 ? gold / top100 : 0,
      usdt,
      avgUsdt: n ? usdt / n : 0,
      avgLevel: lv.length ? sum(lv) / lv.length : null,
      maxLevel: lv.length ? Math.max(...lv) : null,
      best: mine.reduce<ClassedPlayer | null>((b, p) => (!b || p.gold > b.gold ? p : b), null),
    };
  };
  return [...PLAYER_CLASSES.map(stats).sort((a, b) => b.usdt - a.usdt), stats('unknown')];
}

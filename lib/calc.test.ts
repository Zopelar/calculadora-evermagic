import { describe, expect, it } from 'vitest';
import {
  classStats,
  estimateOutside,
  guildShares,
  joinLevels,
  poolSlices,
  rankFor,
  rankPlayers,
  totalGold,
  valuePerGold,
  type GuildInfo,
  type Player,
  type PlayerLevel,
} from './calc';

// Snapshot real de 24/10/2026 ~22h (na-bridge.evermagic.io).
const OFFICIAL = { eva: 363.348, usdt: 0, evaPrice: 42.408399, usdBrl: 4.9652 };
const TOP5: Player[] = [
  { player: 'JosepRust', guild: 'MANA', gold: 47793775 },
  { player: 'Ever', guild: 'MANA', gold: 28466543 },
  { player: 'ceffia', guild: null, gold: 23722348 },
  { player: 'MANAKita', guild: 'MANA', gold: 20343208 },
  { player: 'oharroo', guild: 'MANA', gold: 19264316 },
];

describe('poolSlices', () => {
  it('bate com o total em USDT exibido na página oficial da prize pool', () => {
    // evermagic.io/prizepool mostrava usdt = 15409.006959 para 363,348 EVA a 42,408399
    expect(poolSlices(OFFICIAL).totalUsdt).toBeCloseTo(15409.006959, 5);
  });

  it('divide a pool em 10/75/6/6/3 e as fatias somam o total', () => {
    const s = poolSlices({ eva: 100, usdt: 0, evaPrice: 10, usdBrl: 5 });
    expect(s).toMatchObject({ totalUsdt: 1000, team: 100, individual: 750, guilds: 60, referral: 60, bugs: 30 });
    expect(s.team + s.individual + s.guilds + s.referral + s.bugs).toBeCloseTo(s.totalUsdt, 9);
  });

  it('soma saldo em USDT da carteira e converte o total de volta para EVA', () => {
    const s = poolSlices({ eva: 100, usdt: 500, evaPrice: 10, usdBrl: 5 });
    expect(s.totalUsdt).toBe(1500);
    expect(s.totalEva).toBe(150);
  });
});

describe('totalGold / valuePerGold', () => {
  it('soma o gold do top 100 com o gold estimado fora dele', () => {
    expect(totalGold(TOP5)).toBe(139590190);
    expect(totalGold(TOP5, 10_000_000)).toBe(149590190);
  });

  it('valor por gold é a fatia individual dividida pelo gold total', () => {
    expect(valuePerGold(750, 1_000_000)).toBe(0.00075);
  });

  it('gold total zero não gera divisão por zero', () => {
    expect(valuePerGold(750, 0)).toBe(0);
    expect(totalGold([])).toBe(0);
  });
});

describe('rankPlayers', () => {
  const ranked = rankPlayers(TOP5, 750, totalGold(TOP5));

  it('ganho é proporcional ao gold e a soma distribui toda a fatia individual', () => {
    const sum = ranked.reduce((s, r) => s + r.usdt, 0);
    expect(sum).toBeCloseTo(750, 9);
    expect(ranked[0].usdt / ranked[1].usdt).toBeCloseTo(47793775 / 28466543, 9);
    expect(ranked[0].share).toBeCloseTo(47793775 / 139590190, 12);
  });

  it('calcula o gold que falta para passar o jogador de cima; o #1 não tem', () => {
    expect(ranked[0].toNext).toBeNull();
    expect(ranked[1].toNext).toBe(47793775 - 28466543 + 1);
  });

  it('ordena por gold mesmo que a API devolva fora de ordem', () => {
    const r = rankPlayers([...TOP5].reverse(), 750, totalGold(TOP5));
    expect(r.map((p) => [p.rank, p.player])).toEqual([
      [1, 'JosepRust'],
      [2, 'Ever'],
      [3, 'ceffia'],
      [4, 'MANAKita'],
      [5, 'oharroo'],
    ]);
  });

  it('empate em gold: precisa de 1 gold para passar', () => {
    const r = rankPlayers(
      [
        { player: 'A', guild: null, gold: 500 },
        { player: 'B', guild: null, gold: 500 },
      ],
      100,
      1000,
    );
    expect(r[1].toNext).toBe(1);
  });

  it('gold fora do top 100 reduz o ganho de quem está no top', () => {
    const semFora = rankPlayers(TOP5, 750, totalGold(TOP5))[0].usdt;
    const comFora = rankPlayers(TOP5, 750, totalGold(TOP5, totalGold(TOP5)))[0].usdt;
    expect(comFora).toBeCloseTo(semFora / 2, 9);
  });
});

describe('estimateOutside (faixa pelos passes vendidos on-chain)', () => {
  // Referência de 27/10/2026 ~01h40: pool ≈ 15.720 USDT, top 100 ≈ 1,15 bi de gold, 100º ≈ 2,12 mi, 136 passes.
  const top100: Player[] = Array.from({ length: 100 }, (_, i) => ({
    player: `p${i}`,
    guild: null,
    gold: i === 99 ? 2_120_000 : (1_150_000_000 - 2_120_000) / 99,
  }));
  const est = estimateOutside(136, top100, 15_720 * 0.75);
  const per100k = (s: 'optimistic' | 'likely' | 'worst') => 100_000 * est.perGold[s];

  it('pagantes fora do top = passes − jogadores do ranking; gold fora pelo 100º colocado', () => {
    expect(est).toMatchObject({ passes: 136, payingOutside: 36, gold100: 2_120_000 });
    expect(est.outside).toEqual({ optimistic: 0, likely: 36 * 2_120_000 * 0.5, worst: 36 * 2_120_000 });
  });

  it('100 mil de gold: ≈ 1,03 otimista, ≈ 0,99 provável (−3%) e ≈ 0,96 no pior caso (−6%)', () => {
    expect(per100k('optimistic')).toBeCloseTo(1.0252, 4);
    expect(per100k('likely')).toBeCloseTo(0.9923, 4);
    expect(per100k('worst')).toBeCloseTo(0.9614, 4);
    expect(per100k('likely') / per100k('optimistic') - 1).toBeCloseTo(-0.032, 3);
    expect(per100k('worst') / per100k('optimistic') - 1).toBeCloseTo(-0.062, 3);
  });

  it('otimista é o cálculo atual (só o top 100)', () => {
    expect(est.perGold.optimistic).toBe(valuePerGold(15_720 * 0.75, totalGold(top100)));
  });

  it('menos passes que jogadores no ranking: ninguém pagante fora, faixa vira um valor só', () => {
    const e = estimateOutside(80, top100, 1000);
    expect(e.payingOutside).toBe(0);
    expect(e.perGold.worst).toBe(e.perGold.optimistic);
  });

  it('fator do cenário provável é configurável; ranking vazio não gera NaN', () => {
    expect(estimateOutside(136, top100, 1000, 0.25).outside.likely).toBe(36 * 2_120_000 * 0.25);
    expect(estimateOutside(10, [], 1000)).toMatchObject({ payingOutside: 10, gold100: 0, perGold: { worst: 0 } });
  });
});

describe('rankFor (simulador)', () => {
  it('diz em que posição um gold hipotético ficaria', () => {
    expect(rankFor(TOP5, 50_000_000)).toBe(1);
    expect(rankFor(TOP5, 25_000_000)).toBe(3);
    expect(rankFor(TOP5, 1)).toBe(6);
  });

  it('empatar com alguém não passa ele', () => {
    expect(rankFor(TOP5, 28466543)).toBe(2);
  });
});

describe('guildShares', () => {
  const GUILDS: GuildInfo[] = [
    { guild: 'MANA', level: 4, gp: 650824, members: 25 },
    { guild: 'PK', level: 3, gp: 165216, members: 24 },
  ];
  const players: Player[] = [
    { player: 'a', guild: 'MANA', gold: 300 },
    { player: 'b', guild: 'MANA', gold: 100 },
    { player: 'c', guild: 'Cidadela', gold: 100 },
    { player: 'd', guild: null, gold: 9999 },
  ];

  it('base gold: soma o gold dos membros no top 100 e ignora quem não tem guilda', () => {
    const rows = guildShares(players, GUILDS, 60, 'gold');
    const mana = rows.find((r) => r.guild === 'MANA')!;
    expect(mana).toMatchObject({ topMembers: 2, topGold: 400, share: 0.8, level: 4, gp: 650824, members: 25 });
    expect(mana.usdt).toBeCloseTo(48, 9);
    expect(rows.find((r) => r.guild === 'Cidadela')!.usdt).toBeCloseTo(12, 9);
    expect(rows.reduce((s, r) => s + r.usdt, 0)).toBeCloseTo(60, 9);
  });

  it('guilda do ranking oficial sem ninguém no top 100 aparece com 0 na base gold', () => {
    const pk = guildShares(players, GUILDS, 60, 'gold').find((r) => r.guild === 'PK')!;
    expect(pk).toMatchObject({ topMembers: 0, topGold: 0, share: 0, usdt: 0, members: 24 });
  });

  it('base GP: divide pelos pontos de guilda; guilda sem GP conhecido fica com 0', () => {
    const rows = guildShares(players, GUILDS, 60, 'gp');
    expect(rows.map((r) => r.guild)).toEqual(['MANA', 'PK', 'Cidadela']);
    expect(rows[0].usdt).toBeCloseTo((60 * 650824) / (650824 + 165216), 9);
    expect(rows[2]).toMatchObject({ guild: 'Cidadela', share: 0, usdt: 0 });
    expect(rows[2].gp).toBeUndefined();
  });

  it('ordena pela fatia, maior primeiro', () => {
    const rows = guildShares(players, GUILDS, 60, 'gold');
    expect(rows.map((r) => r.guild)).toEqual(['MANA', 'Cidadela', 'PK']);
  });

  it('sem pesos não divide nada (sem NaN)', () => {
    const rows = guildShares([], [], 60, 'gold');
    expect(rows).toEqual([]);
    const semGold = guildShares([], GUILDS, 60, 'gold');
    expect(semGold.every((r) => r.share === 0 && r.usdt === 0)).toBe(true);
  });
});

describe('joinLevels (cruzamento gold × nível)', () => {
  const gold: Player[] = [
    { player: 'JosepRust', guild: 'MANA', gold: 300 },
    { player: 'Ever', guild: 'MANA', gold: 200 },
    { player: 'SoNoGold', guild: null, gold: 100 },
  ];
  const levels: PlayerLevel[] = [
    { player: 'ever', class: 'archer', guild: 'MANA', level: 78 },
    { player: ' JosepRust ', class: 'Knight', guild: 'MANA', level: 60 },
    { player: 'SoNoNivel', class: 'mage', guild: null, level: 70 },
  ];
  const joined = joinLevels(rankPlayers(gold, 600, 600), levels);

  it('junta pelo nick ignorando maiúsculas e espaços', () => {
    expect(joined[0]).toMatchObject({ player: 'JosepRust', cls: 'knight', level: 60 });
    expect(joined[1]).toMatchObject({ player: 'Ever', cls: 'archer', level: 78 });
  });

  it('quem está no top de gold mas fora do top de nível fica com classe desconhecida', () => {
    expect(joined[2]).toMatchObject({ player: 'SoNoGold', cls: 'unknown', level: null, levelRank: null });
  });

  it('posição no nível segue a ordem por nível, mesmo que a API venha fora de ordem', () => {
    expect(joined.map((p) => p.levelRank)).toEqual([3, 1, null]);
  });

  it('mantém o ranking de gold e o ganho calculados antes', () => {
    expect(joined.map((p) => [p.rank, p.usdt])).toEqual([
      [1, 300],
      [2, 200],
      [3, 100],
    ]);
  });

  it('classe fora das três conhecidas vira desconhecida, mas o nível continua', () => {
    const [p] = joinLevels(rankPlayers([gold[0]], 1, 1), [{ ...levels[1], class: 'priest' }]);
    expect(p).toMatchObject({ cls: 'unknown', level: 60 });
  });
});

describe('classStats', () => {
  const gold: Player[] = [
    { player: 'a1', guild: null, gold: 400 },
    { player: 'm1', guild: null, gold: 300 },
    { player: 'a2', guild: null, gold: 200 },
    { player: 'k1', guild: null, gold: 60 },
    { player: 'x1', guild: null, gold: 40 },
  ];
  const levels: PlayerLevel[] = [
    { player: 'a1', class: 'archer', guild: null, level: 70 },
    { player: 'm1', class: 'mage', guild: null, level: 66 },
    { player: 'a2', class: 'archer', guild: null, level: 60 },
    { player: 'k1', class: 'knight', guild: null, level: 55 },
    { player: 'soNivel', class: 'archer', guild: null, level: 80 },
  ];
  const players = joinLevels(rankPlayers(gold, 1000, totalGold(gold)), levels);
  const stats = classStats(players, levels);
  const by = (cls: string) => stats.find((s) => s.cls === cls)!;

  it('ordena as classes pelo ganho total e deixa a desconhecida por último', () => {
    expect(stats.map((s) => s.cls)).toEqual(['archer', 'mage', 'knight', 'unknown']);
  });

  it('soma das classes (com a desconhecida) fecha com o total do ranking individual', () => {
    expect(stats.reduce((s, c) => s + c.usdt, 0)).toBeCloseTo(1000, 9);
    expect(stats.reduce((s, c) => s + c.gold, 0)).toBe(1000);
    expect(stats.reduce((s, c) => s + c.goldShare, 0)).toBeCloseTo(1, 12);
  });

  it('separa total e média por jogador', () => {
    expect(by('archer')).toMatchObject({ goldPlayers: 2, gold: 600, avgGold: 300, usdt: 600, avgUsdt: 300, goldShare: 0.6 });
    expect(by('mage')).toMatchObject({ goldPlayers: 1, gold: 300, avgGold: 300, usdt: 300, avgUsdt: 300 });
  });

  it('nível conta quem está só no top de nível; gold conta só quem está no top de gold', () => {
    expect(by('archer')).toMatchObject({ levelPlayers: 3, maxLevel: 80, avgLevel: 70 });
    expect(by('archer').goldPlayers).toBe(2);
  });

  it('melhor jogador da classe é o de maior gold', () => {
    expect(by('archer').best).toMatchObject({ player: 'a1', level: 70, gold: 400 });
    expect(by('unknown')).toMatchObject({ goldPlayers: 1, gold: 40, levelPlayers: 0, avgLevel: null, maxLevel: null });
  });

  it('sem ranking de nível: todos ficam desconhecidos, sem NaN', () => {
    const s = classStats(joinLevels(rankPlayers(gold, 1000, 1000), []), []);
    expect(s.find((c) => c.cls === 'unknown')).toMatchObject({ goldPlayers: 5, usdt: 1000 });
    expect(s.find((c) => c.cls === 'archer')).toMatchObject({ goldPlayers: 0, avgGold: 0, avgUsdt: 0, avgLevel: null, best: null });
  });
});

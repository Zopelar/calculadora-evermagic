import { describe, expect, it } from 'vitest';
import { guildShares, poolSlices, rankFor, rankPlayers, totalGold, valuePerGold, type GuildInfo, type Player } from './calc';

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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { USER_AGENT } from '../config';
import { fetchEvaPrice, fetchGoldRanking, fetchGuildRanking, fetchLevelRanking } from './evermagic';

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchGoldRanking', () => {
  it('normaliza a resposta do /ranking/gold (guilda vazia vira null, gold vira número)', async () => {
    mockFetch({
      ranking: [
        { player: 'JosepRust', guild: 'MANA', gold: 47793775 },
        { player: 'ceffia', guild: null, gold: 23722348 },
        { player: 'Semguilda', guild: '', gold: '1000' },
        { player: 'Quebrado', guild: null, gold: null },
      ],
    });
    expect(await fetchGoldRanking()).toEqual([
      { player: 'JosepRust', guild: 'MANA', gold: 47793775 },
      { player: 'ceffia', guild: null, gold: 23722348 },
      { player: 'Semguilda', guild: null, gold: 1000 },
      { player: 'Quebrado', guild: null, gold: 0 },
    ]);
  });

  it('se identifica com User-Agent próprio e não usa cache do fetch', async () => {
    const fn = mockFetch({ ranking: [] });
    await fetchGoldRanking();
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('https://na-bridge.evermagic.io/bridge/ranking/gold');
    expect((init?.headers as Record<string, string>)['User-Agent']).toBe(USER_AGENT);
    expect(init?.cache).toBe('no-store');
  });

  it('falha com erro HTTP (ex.: rate limit) para o cache servir o último dado', async () => {
    mockFetch({ error: 'Too many requests' }, 429);
    await expect(fetchGoldRanking()).rejects.toThrow('HTTP 429');
  });

  it('falha se o formato mudar (sem o array "ranking")', async () => {
    mockFetch({ data: [] });
    await expect(fetchGoldRanking()).rejects.toThrow('formato inesperado');
  });
});

describe('fetchGuildRanking / fetchLevelRanking', () => {
  it('normaliza o /ranking/guild', async () => {
    mockFetch({ ranking: [{ guild: 'MANA', level: 4, gp: 650824, members: 25 }, { guild: 'X', level: null }] });
    expect(await fetchGuildRanking()).toEqual([
      { guild: 'MANA', level: 4, gp: 650824, members: 25 },
      { guild: 'X', level: 0, gp: 0, members: 0 },
    ]);
  });

  it('normaliza o /ranking/level', async () => {
    mockFetch({ ranking: [{ player: 'MANAKita', class: 'archer', guild: 'MANA', level: 76 }] });
    expect(await fetchLevelRanking()).toEqual([{ player: 'MANAKita', class: 'archer', guild: 'MANA', level: 76 }]);
  });
});

describe('fetchEvaPrice', () => {
  it('lê o preço de 1 EVA em USDT, mesma fonte da página oficial', async () => {
    const fn = mockFetch({ amount: '1', price: '42.408399', total: '42.408399' });
    expect(await fetchEvaPrice()).toBe(42.408399);
    expect(fn.mock.calls[0][0]).toBe('https://na-bridge.evermagic.io/bridge/eva/price?amount=1');
  });

  it.each([['0'], ['abc'], [undefined]])('rejeita preço inválido (%s) em vez de zerar a pool', async (price) => {
    mockFetch({ price });
    await expect(fetchEvaPrice()).rejects.toThrow('preço do EVA inválido');
  });
});

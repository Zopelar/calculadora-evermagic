import { afterEach, describe, expect, it, vi } from 'vitest';
import { cached } from './http';

afterEach(() => vi.useRealTimers());

// Cada teste usa uma chave própria porque o cache é global ao módulo.
describe('cached', () => {
  it('não chama a fonte de novo dentro dos 5 minutos', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-24T22:00:00Z') });
    const load = vi.fn(async () => 'ranking');
    await cached('ttl', load);
    vi.setSystemTime(new Date('2026-10-24T22:04:59Z'));
    const r = await cached('ttl', load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ data: 'ranking', stale: false });
  });

  it('busca de novo depois de 5 minutos', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-24T22:00:00Z') });
    const load = vi.fn(async () => Date.now());
    await cached('expira', load);
    vi.setSystemTime(new Date('2026-10-24T22:05:01Z'));
    const r = await cached('expira', load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(r.at).toBe(Date.parse('2026-10-24T22:05:01Z'));
  });

  it('se a fonte cair, serve o último dado marcado como stale com o horário original', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-24T22:00:00Z') });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await cached('queda', async () => 'dados das 22:00');
    vi.setSystemTime(new Date('2026-10-24T22:30:00Z'));
    const r = await cached('queda', async () => {
      throw new Error('HTTP 502');
    });
    expect(r).toEqual({ data: 'dados das 22:00', at: Date.parse('2026-10-24T22:00:00Z'), stale: true });
  });

  it('depois de uma falha sem dado guardado, não insiste na fonte por 1 minuto', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T04:00:00Z') });
    const load = vi.fn(async () => {
      throw new Error('HTTP 429');
    });
    await expect(cached('freio', load)).rejects.toThrow('HTTP 429');
    vi.setSystemTime(new Date('2026-10-25T04:00:59Z'));
    await expect(cached('freio', load)).rejects.toThrow();
    expect(load).toHaveBeenCalledTimes(1); // a 2ª visita não chamou a fonte
    vi.setSystemTime(new Date('2026-10-25T04:01:01Z'));
    await expect(cached('freio', load)).rejects.toThrow('HTTP 429');
    expect(load).toHaveBeenCalledTimes(2); // passou 1 min: tenta de novo
  });

  it('com dado antigo e fonte fora, serve o antigo sem chamar a fonte durante o freio', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T04:00:00Z') });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await cached('freio-stale', async () => 'ok');
    vi.setSystemTime(new Date('2026-10-25T04:06:00Z'));
    const load = vi.fn(async () => {
      throw new Error('HTTP 502');
    });
    await cached('freio-stale', load);
    vi.setSystemTime(new Date('2026-10-25T04:06:30Z'));
    const r = await cached('freio-stale', load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ data: 'ok', stale: true });
  });

  it('volta ao normal quando a fonte se recupera', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T04:00:00Z') });
    await expect(
      cached('recupera', async () => {
        throw new Error('HTTP 429');
      }),
    ).rejects.toThrow();
    vi.setSystemTime(new Date('2026-10-25T04:01:01Z'));
    expect(await cached('recupera', async () => 'voltou')).toMatchObject({ data: 'voltou', stale: false });
  });

  it('aceita validade própria (composição on-chain: 10 min)', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-27T04:00:00Z') });
    const load = vi.fn(async () => Date.now());
    await cached('ttl-10min', load, 600);
    vi.setSystemTime(new Date('2026-10-27T04:09:59Z'));
    await cached('ttl-10min', load, 600);
    expect(load).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-27T04:10:01Z'));
    await cached('ttl-10min', load, 600);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('sem nenhum dado anterior, propaga o erro', async () => {
    await expect(
      cached('vazio', async () => {
        throw new Error('HTTP 502');
      }),
    ).rejects.toThrow('HTTP 502');
  });
});

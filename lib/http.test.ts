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
    expect(r).toMatchObject({ data: 'dados das 22:00', at: Date.parse('2026-10-24T22:00:00Z'), stale: true });
  });

  it('registra quando o conteúdo mudou e entre quais leituras', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-28T21:00:00Z') });
    let ranking = 'v1';
    const load = async () => ranking;
    // 1ª leitura: não dá para saber quando a fonte mudou, só que está assim desde agora
    const first = Date.parse('2026-10-28T21:00:00Z');
    expect(await cached('mudou', load)).toMatchObject({ sameSince: first, changedAfter: null });
    vi.setSystemTime(new Date('2026-10-28T21:05:01Z'));
    expect(await cached('mudou', load)).toMatchObject({ sameSince: first, changedAfter: null }); // igual
    ranking = 'v2';
    vi.setSystemTime(new Date('2026-10-28T21:10:02Z'));
    expect(await cached('mudou', load)).toMatchObject({
      data: 'v2',
      sameSince: Date.parse('2026-10-28T21:10:02Z'),
      changedAfter: Date.parse('2026-10-28T21:05:01Z'),
    });
    vi.setSystemTime(new Date('2026-10-28T21:15:03Z'));
    const same = await cached('mudou', load); // nova leitura igual: mantém a última mudança
    expect(same).toMatchObject({
      at: Date.parse('2026-10-28T21:15:03Z'),
      sameSince: Date.parse('2026-10-28T21:10:02Z'),
      changedAfter: Date.parse('2026-10-28T21:05:01Z'),
    });
  });

  it('compara o conteúdo, não a referência (objetos novos e iguais não contam como mudança)', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-28T21:00:00Z') });
    const load = async () => [{ player: 'Ever', gold: 1 }];
    await cached('mesmo-conteudo', load);
    vi.setSystemTime(new Date('2026-10-28T21:05:01Z'));
    expect((await cached('mesmo-conteudo', load)).changedAfter).toBeNull();
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

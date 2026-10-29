import { describe, expect, it } from 'vitest';
import { trackChange, type Reading } from './change';

const t = (hhmm: string) => Date.parse(`2026-10-29T${hhmm}:00Z`);
// leitura que a aba recebeu: conteúdo, horário da leitura e o que o servidor sabia da mudança
const read = (sig: string, at: string, since: string, after: string | null): Reading => ({
  sig,
  at: t(at),
  since: t(since),
  after: after === null ? null : t(after),
});

describe('trackChange', () => {
  it('sem leitura anterior, fica o que o servidor disse', () => {
    const r = read('A', '09:00', '09:00', null);
    expect(trackChange(null, r)).toEqual(r);
  });

  it('instância nova traz conteúdo novo: mudou depois da leitura anterior da aba', () => {
    const r = trackChange(read('A', '09:00', '09:00', null), read('B', '09:06', '09:06', null));
    expect(r).toMatchObject({ since: t('09:06'), after: t('09:00') });
  });

  it('instância nova com o mesmo conteúdo não apaga a mudança que a aba já conhecia', () => {
    const r = trackChange(read('B', '09:06', '09:06', '09:00'), read('B', '09:12', '09:12', null));
    expect(r).toMatchObject({ at: t('09:12'), since: t('09:06'), after: t('09:00') });
  });

  it('servidor viu a mudança mais perto: usa a janela dele', () => {
    const r = trackChange(read('A', '09:00', '08:40', null), read('B', '09:07', '09:07', '09:03'));
    expect(r).toMatchObject({ since: t('09:07'), after: t('09:03') });
  });

  it('mesmo conteúdo visto por duas instâncias: fica a janela mais estreita', () => {
    const r = trackChange(read('B', '09:10', '09:10', '09:02'), read('B', '09:15', '09:08', '09:05'));
    expect(r).toMatchObject({ since: t('09:08'), after: t('09:05') });
  });

  it('leituras contraditórias: fica só o que o servidor disse', () => {
    const next = read('B', '09:06', '08:55', '08:50');
    expect(trackChange(read('A', '09:00', '09:00', null), next)).toEqual(next);
  });
});

import { describe, expect, it } from 'vitest';
import { fmtAgo } from './format';

describe('fmtAgo', () => {
  const now = Date.parse('2026-10-28T21:40:00Z');
  const ago = (min: number) => fmtAgo(now - min * 60_000, now);

  it.each([
    [0, 'agora'],
    [0.9, 'agora'],
    [8, 'há 8 min'],
    [59, 'há 59 min'],
    [60, 'há 1 h'],
    [125, 'há 2 h 5 min'],
    [24 * 60 + 30, 'há 1 d'],
  ])('%s min → %s', (min, text) => {
    expect(ago(min)).toBe(text);
  });

  it('horário no futuro (relógio do celular atrasado) vira "agora"', () => {
    expect(fmtAgo(now + 120_000, now)).toBe('agora');
  });
});

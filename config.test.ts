import { isAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { DONATION_WALLET, EVA_TOKEN, PRIZE_WALLET, SPLIT, USDT_TOKEN } from './config';

// Protege as edições manuais do config.ts.
describe('config', () => {
  it('endereços são válidos (inclui checksum: pega erro de digitação em endereço com maiúsculas)', () => {
    for (const address of [PRIZE_WALLET, EVA_TOKEN, USDT_TOKEN]) expect(isAddress(address), address).toBe(true);
  });

  it('carteira de doação vazia (seção escondida) ou endereço válido', () => {
    expect(DONATION_WALLET === '' || isAddress(DONATION_WALLET), DONATION_WALLET).toBe(true);
  });

  it('a divisão da prize pool soma 100%', () => {
    expect(Object.values(SPLIT).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
});

import { isAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  DONATION_WALLET,
  EVA_TOKEN,
  GAME_PASS_EVA,
  LOGS_WINDOW_BLOCKS,
  POOL_FINAL,
  POTION_EVA,
  PRIZE_WALLET,
  SEED_EVA,
  SEED_FROM,
  SPLIT,
  USDT_TOKEN,
} from './config';

// Protege as edições manuais do config.ts.
describe('config', () => {
  it('endereços são válidos (inclui checksum: pega erro de digitação em endereço com maiúsculas)', () => {
    for (const address of [PRIZE_WALLET, EVA_TOKEN, USDT_TOKEN, SEED_FROM]) expect(isAddress(address), address).toBe(true);
  });

  it('preços em EVA são decimais positivos e a janela de logs respeita o limite do RPC', () => {
    for (const price of [GAME_PASS_EVA, POTION_EVA, SEED_EVA]) expect(Number(price), price).toBeGreaterThan(0);
    expect(LOGS_WINDOW_BLOCKS).toBeLessThanOrEqual(10_000_000);
  });

  it('carteira de doação vazia (seção escondida) ou endereço válido', () => {
    expect(DONATION_WALLET === '' || isAddress(DONATION_WALLET), DONATION_WALLET).toBe(true);
  });

  it('saldo do fechamento: desligado (null) ou valores válidos', () => {
    if (POOL_FINAL === null) return;
    expect(POOL_FINAL.eva).toBeGreaterThan(0);
    expect(POOL_FINAL.usdt).toBeGreaterThanOrEqual(0);
  });

  it('a divisão da prize pool soma 100%', () => {
    expect(Object.values(SPLIT).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
});

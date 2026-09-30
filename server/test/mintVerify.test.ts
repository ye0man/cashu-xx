import { describe, expect, it } from 'vitest';
import { parseInfoBody, parseKeysBody } from '../src/wallet/mintVerify';

describe('mint verification parsing', () => {
  it('parses the Minibits info shape', () => {
    const info = parseInfoBody({
      name: 'Minibits mint',
      description: 'Minibits wallet mint. Minibits is an active research project in BETA, use at your own risk.',
      nuts: { 4: {} },
    });
    expect(info.name).toBe('Minibits mint');
    expect(info.description).toContain('BETA');
  });

  it('parses input_fee_ppk from the sat keyset', () => {
    const keys = parseKeysBody({
      keysets: [
        { id: '01fc', unit: 'sat', active: true, keys: { 1: '03ab' }, input_fee_ppk: 0 },
        { id: '02ee', unit: 'usd', active: true, keys: { 1: '02cd' }, input_fee_ppk: 1000 },
      ],
    });
    expect(keys.feePpk).toBe(0);
  });

  it('defaults to zero fees on unknown shapes', () => {
    expect(parseKeysBody({}).feePpk).toBe(0);
    expect(parseKeysBody({ keysets: [] }).feePpk).toBe(0);
    expect(parseInfoBody({})).toEqual({ name: 'unknown mint', description: '' });
  });
});

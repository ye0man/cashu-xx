import { describe, expect, it } from 'vitest';
import { MintMonitor, parseInfoBody, parseKeysBody } from '../src/wallet/mintVerify';

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

  it('prefers the active sat keyset fee', () => {
    const keys = parseKeysBody({
      keysets: [
        { id: '00aa', unit: 'sat', active: false, input_fee_ppk: 100 },
        { id: '01fc', unit: 'sat', active: true, input_fee_ppk: 0 },
      ],
    });
    expect(keys.feePpk).toBe(0);
  });
});

describe('MintMonitor', () => {
  const online = { online: true, name: 'Minibits mint', description: '', feePpk: 0 };
  const offline = { online: false, name: '', description: '', feePpk: 0, error: 'fetch failed' };

  it('re-checks while offline so a transient failure heals itself', async () => {
    const answers = [offline, online];
    let calls = 0;
    const monitor = new MintMonitor('https://mint.example', async () => answers[calls++] ?? online, 60_000, 0);
    expect((await monitor.get()).online).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect((await monitor.get()).online).toBe(true);
    expect(calls).toBe(2);
  });

  it('caches a healthy answer and shares one in-flight check', async () => {
    let calls = 0;
    const monitor = new MintMonitor('https://mint.example', async () => {
      calls += 1;
      return online;
    });
    await Promise.all([monitor.get(), monitor.get(), monitor.get()]);
    await monitor.get();
    expect(calls).toBe(1);
  });
});

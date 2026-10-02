import { CURATED_MINTS, DEFAULT_MINT_URL, isValidMintUrl, normalizeMintUrl } from '@cashu-xx/shared';
import { describe, expect, it } from 'vitest';
import {
  MintDirectory,
  MintMonitor,
  parseInfoBody,
  parseKeysBody,
  parseSupportsMint,
} from '../src/wallet/mintVerify';

describe('normalizeMintUrl', () => {
  it('canonicalizes host case and trailing slashes', () => {
    expect(normalizeMintUrl('  https://Mint.Example/Bitcoin/  ')).toBe('https://mint.example/Bitcoin');
  });

  it('rejects non-http(s) and malformed values', () => {
    expect(isValidMintUrl('ftp://mint.example')).toBe(false);
    expect(isValidMintUrl('mint.example')).toBe(false);
    expect(isValidMintUrl('')).toBe(false);
    expect(isValidMintUrl(undefined)).toBe(false);
  });

  it('ships Minibits as the curated default', () => {
    expect(CURATED_MINTS[0]?.url).toBe(DEFAULT_MINT_URL);
  });
});

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

  it('reads bolt11 minting support from NUT-06 nuts, permissively', () => {
    expect(parseSupportsMint({ nuts: { 4: {}, 5: {} } })).toBe(true);
    expect(parseSupportsMint({ nuts: { 5: {}, 7: {} } })).toBe(false);
    // Some mints omit `nuts`; don't block them.
    expect(parseSupportsMint({})).toBe(true);
  });
});

describe('MintMonitor', () => {
  const online = {
    url: 'https://mint.example',
    online: true,
    name: 'Minibits mint',
    description: '',
    feePpk: 0,
    compatible: true,
  };
  const offline = {
    url: 'https://mint.example',
    online: false,
    name: '',
    description: '',
    feePpk: 0,
    compatible: false,
    error: 'fetch failed',
  };

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

describe('MintDirectory', () => {
  it('verifies curated mints and labels them, reusing one monitor per URL', async () => {
    let calls = 0;
    const directory = new MintDirectory(async (url) => {
      calls += 1;
      return {
        url,
        online: true,
        name: 'Test mint',
        description: '',
        feePpk: 0,
        compatible: true,
      };
    });
    const curated = [
      { url: 'https://a.example', label: 'A' },
      { url: 'https://b.example', label: 'B' },
    ];
    const list = await directory.list(curated);
    expect(list.map((m) => m.label)).toEqual(['A', 'B']);
    expect(list.every((m) => m.online)).toBe(true);
    expect(calls).toBe(2);
    // A second read is served from the cached monitor.
    await directory.list(curated);
    expect(calls).toBe(2);
  });
});

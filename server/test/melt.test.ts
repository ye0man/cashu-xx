import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  invoiceFromLightningAddress,
  isBolt11Invoice,
  isLightningAddress,
  resolveDestination,
} from '../src/wallet/melt';

describe('destination classification', () => {
  it('recognises bolt11 invoices and Lightning addresses', () => {
    expect(isBolt11Invoice('lnbc1pmelt')).toBe(true);
    expect(isBolt11Invoice('lntb10u1ptest')).toBe(true);
    expect(isBolt11Invoice('you@wallet.com')).toBe(false);
    expect(isLightningAddress('you@wallet.com')).toBe(true);
    expect(isLightningAddress('not-an-address')).toBe(false);
  });

  it('passes an invoice through and rejects anything else', async () => {
    await expect(resolveDestination('lnbc1pmelt', 90)).resolves.toBe('lnbc1pmelt');
    await expect(resolveDestination('nonsense', 90)).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('invoiceFromLightningAddress', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves an address through LNURL-pay', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.includes('/.well-known/lnurlp/')) {
        return {
          ok: true,
          json: async () => ({ tag: 'payRequest', callback: 'https://wallet.example/lnurl', minSendable: 1000, maxSendable: 1_000_000 }),
        };
      }
      return { ok: true, json: async () => ({ pr: 'lnbc1generated' }) };
    });

    await expect(invoiceFromLightningAddress('you@wallet.example', 90)).resolves.toBe('lnbc1generated');
    expect(calls[0]).toContain('https://wallet.example/.well-known/lnurlp/you');
    expect(calls[1]).toContain('amount=90000');
  });

  it('rejects amounts the address does not accept', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ tag: 'payRequest', callback: 'https://wallet.example/lnurl', minSendable: 100_000, maxSendable: 1_000_000 }),
    }));
    await expect(invoiceFromLightningAddress('you@wallet.example', 10)).rejects.toMatchObject({ code: 'invalid' });
  });
});

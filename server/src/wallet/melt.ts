import { WalletError } from './WalletService';

const LNURL_TIMEOUT_MS = 8000;

export function isBolt11Invoice(value: string): boolean {
  return /^ln(bc|tb|bcrt)[0-9a-z]+$/i.test(value.trim());
}

export function isLightningAddress(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

interface LnurlPayResponse {
  tag?: unknown;
  callback?: unknown;
  minSendable?: unknown;
  maxSendable?: unknown;
}

interface LnurlInvoiceResponse {
  pr?: unknown;
  status?: unknown;
  reason?: unknown;
}

/**
 * Resolves a `user@domain` Lightning address (LNURL-pay, LUD-16) to a bolt11
 * invoice for `amountSats`. Throws `WalletError('invalid', ...)` with a readable
 * reason for every failure so the game can surface it.
 */
export async function invoiceFromLightningAddress(address: string, amountSats: number): Promise<string> {
  const trimmed = address.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0 || at === trimmed.length - 1) {
    throw new WalletError('invalid', 'not a valid Lightning address');
  }
  const user = trimmed.slice(0, at);
  const host = trimmed.slice(at + 1);
  const amountMsat = Math.round(amountSats * 1000);
  if (amountMsat <= 0) {
    throw new WalletError('invalid', 'melt amount must be positive');
  }

  const signal = AbortSignal.timeout(LNURL_TIMEOUT_MS);
  let meta: LnurlPayResponse;
  try {
    const res = await fetch(`https://${host}/.well-known/lnurlp/${encodeURIComponent(user)}`, { signal });
    if (!res.ok) {
      throw new WalletError('invalid', `Lightning address lookup failed (HTTP ${res.status})`);
    }
    meta = (await res.json()) as LnurlPayResponse;
  } catch (err) {
    if (err instanceof WalletError) {
      throw err;
    }
    throw new WalletError('invalid', `could not reach Lightning address: ${(err as Error).message}`);
  }

  if (meta.tag !== 'payRequest' || typeof meta.callback !== 'string') {
    throw new WalletError('invalid', 'that address is not a Lightning pay endpoint');
  }
  const min = typeof meta.minSendable === 'number' ? meta.minSendable : 1000;
  const max = typeof meta.maxSendable === 'number' ? meta.maxSendable : Number.POSITIVE_INFINITY;
  if (amountMsat < min || amountMsat > max) {
    throw new WalletError(
      'invalid',
      `address accepts ${Math.ceil(min / 1000)}–${Math.floor(max / 1000)} sats, not ${amountSats}`,
    );
  }

  const join = meta.callback.includes('?') ? '&' : '?';
  try {
    const res = await fetch(`${meta.callback}${join}amount=${amountMsat}`, {
      signal: AbortSignal.timeout(LNURL_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new WalletError('invalid', `invoice request failed (HTTP ${res.status})`);
    }
    const body = (await res.json()) as LnurlInvoiceResponse;
    if (typeof body.pr !== 'string' || body.pr.length === 0) {
      throw new WalletError('invalid', typeof body.reason === 'string' ? body.reason : 'no invoice returned');
    }
    return body.pr;
  } catch (err) {
    if (err instanceof WalletError) {
      throw err;
    }
    throw new WalletError('invalid', `could not get an invoice: ${(err as Error).message}`);
  }
}

/**
 * Turns a player-supplied destination into a bolt11 invoice for roughly
 * `wantedSats`. A bolt11 invoice is passed through (its own amount decides what
 * the mint quote will cost); a Lightning address has an invoice generated for it.
 */
export async function resolveDestination(destination: string, wantedSats: number): Promise<string> {
  const value = destination.trim();
  if (isBolt11Invoice(value)) {
    return value;
  }
  if (isLightningAddress(value)) {
    return invoiceFromLightningAddress(value, wantedSats);
  }
  throw new WalletError('invalid', 'enter a Lightning address (you@wallet) or paste a bolt11 invoice');
}

import type { MintInfoResponse } from '@cashu-xx/shared';

const VERIFY_TIMEOUT_MS = 8000;

export function parseInfoBody(json: unknown): { name: string; description: string } {
  const body = json as { name?: unknown; description?: unknown };
  return {
    name: typeof body?.name === 'string' ? body.name : 'unknown mint',
    description: typeof body?.description === 'string' ? body.description : '',
  };
}

/** Reads the input fee from `/v1/keysets`, preferring the active sat keyset. */
export function parseKeysBody(json: unknown): { feePpk: number } {
  const body = json as { keysets?: unknown };
  const keysets = (Array.isArray(body?.keysets) ? body.keysets : []) as Array<{
    unit?: unknown;
    active?: unknown;
    input_fee_ppk?: unknown;
  }>;
  const sat = keysets.filter((k) => k?.unit === 'sat' && typeof k?.input_fee_ppk === 'number');
  const chosen = sat.find((k) => k.active === true) ?? sat[0];
  return { feePpk: (chosen?.input_fee_ppk as number | undefined) ?? 0 };
}

export async function verifyMint(mintUrl: string): Promise<MintInfoResponse> {
  try {
    const signal = AbortSignal.timeout(VERIFY_TIMEOUT_MS);
    const [infoRes, keysRes] = await Promise.all([
      fetch(`${mintUrl}/v1/info`, { signal }),
      fetch(`${mintUrl}/v1/keysets`, { signal }),
    ]);
    if (!infoRes.ok || !keysRes.ok) {
      return {
        online: false,
        name: '',
        description: '',
        feePpk: 0,
        error: `mint answered HTTP ${infoRes.ok ? keysRes.status : infoRes.status}`,
      };
    }
    const info = parseInfoBody(await infoRes.json());
    const keys = parseKeysBody(await keysRes.json());
    return { online: true, name: info.name, description: info.description, feePpk: keys.feePpk };
  } catch (err) {
    const error = (err as Error).name === 'TimeoutError' ? `no answer in ${VERIFY_TIMEOUT_MS / 1000}s` : (err as Error).message;
    return { online: false, name: '', description: '', feePpk: 0, error };
  }
}

/**
 * Keeps the last mint check and re-checks lazily: immediately while the mint
 * looks offline (so a transient failure heals itself), otherwise every minute.
 */
export class MintMonitor {
  private info: MintInfoResponse = { online: false, name: '', description: '', feePpk: 0, error: 'checking…' };
  private checkedAt = 0;
  private inflight: Promise<MintInfoResponse> | null = null;

  constructor(
    private readonly mintUrl: string,
    private readonly verify: (url: string) => Promise<MintInfoResponse> = verifyMint,
    private readonly staleMs = 60_000,
    private readonly offlineRetryMs = 3_000,
  ) {}

  refresh(): Promise<MintInfoResponse> {
    if (!this.inflight) {
      this.inflight = this.verify(this.mintUrl)
        .then((info) => {
          this.info = info;
          this.checkedAt = Date.now();
          return info;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }

  async get(): Promise<MintInfoResponse> {
    const age = Date.now() - this.checkedAt;
    if (this.checkedAt === 0 || age > (this.info.online ? this.staleMs : this.offlineRetryMs)) {
      return this.refresh();
    }
    return this.info;
  }
}

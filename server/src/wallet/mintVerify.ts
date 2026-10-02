import { type CuratedMint, type MintCandidate, type MintInfoResponse, normalizeMintUrl } from '@cashu-xx/shared';

const VERIFY_TIMEOUT_MS = 8000;

export function parseInfoBody(json: unknown): { name: string; description: string } {
  const body = json as { name?: unknown; description?: unknown };
  return {
    name: typeof body?.name === 'string' ? body.name : 'unknown mint',
    description: typeof body?.description === 'string' ? body.description : '',
  };
}

/** True when the mint advertises NUT-04 bolt11 minting; permissive if `nuts` is absent. */
export function parseSupportsMint(json: unknown): boolean {
  const nuts = (json as { nuts?: unknown })?.nuts;
  if (!nuts || typeof nuts !== 'object') {
    return true;
  }
  return '4' in (nuts as Record<string, unknown>);
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

function offlineInfo(url: string, error: string): MintInfoResponse {
  return { url, online: false, name: '', description: '', feePpk: 0, compatible: false, error };
}

export async function verifyMint(mintUrl: string): Promise<MintInfoResponse> {
  let url: string;
  try {
    url = normalizeMintUrl(mintUrl);
  } catch (err) {
    return offlineInfo(mintUrl, (err as Error).message);
  }
  try {
    const signal = AbortSignal.timeout(VERIFY_TIMEOUT_MS);
    const [infoRes, keysRes] = await Promise.all([
      fetch(`${url}/v1/info`, { signal }),
      fetch(`${url}/v1/keysets`, { signal }),
    ]);
    if (!infoRes.ok || !keysRes.ok) {
      return offlineInfo(url, `mint answered HTTP ${infoRes.ok ? keysRes.status : infoRes.status}`);
    }
    const infoJson = await infoRes.json();
    const info = parseInfoBody(infoJson);
    const keys = parseKeysBody(await keysRes.json());
    return {
      url,
      online: true,
      name: info.name,
      description: info.description,
      feePpk: keys.feePpk,
      compatible: parseSupportsMint(infoJson),
    };
  } catch (err) {
    const error = (err as Error).name === 'TimeoutError' ? `no answer in ${VERIFY_TIMEOUT_MS / 1000}s` : (err as Error).message;
    return offlineInfo(url, error);
  }
}

/**
 * Keeps the last mint check and re-checks lazily: immediately while the mint
 * looks offline (so a transient failure heals itself), otherwise every minute.
 */
export class MintMonitor {
  private info: MintInfoResponse;
  private checkedAt = 0;
  private inflight: Promise<MintInfoResponse> | null = null;

  constructor(
    private readonly mintUrl: string,
    private readonly verify: (url: string) => Promise<MintInfoResponse> = verifyMint,
    private readonly staleMs = 60_000,
    private readonly offlineRetryMs = 3_000,
  ) {
    this.info = offlineInfo(this.mintUrl, 'checking…');
  }

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

/**
 * One cached, lazily-refreshing monitor per mint URL. Backs both the
 * `/api/mints` discovery list and `/api/mint?url=` verification, so a mint the
 * picker shows online is exactly the mint the server will use.
 */
export class MintDirectory {
  private readonly monitors = new Map<string, MintMonitor>();

  constructor(
    private readonly verify: (url: string) => Promise<MintInfoResponse> = verifyMint,
    private readonly staleMs = 60_000,
    private readonly offlineRetryMs = 3_000,
  ) {}

  private monitor(url: string): MintMonitor {
    let monitor = this.monitors.get(url);
    if (!monitor) {
      monitor = new MintMonitor(url, this.verify, this.staleMs, this.offlineRetryMs);
      this.monitors.set(url, monitor);
    }
    return monitor;
  }

  get(url: string): Promise<MintInfoResponse> {
    return this.monitor(url).get();
  }

  async list(curated: CuratedMint[]): Promise<MintCandidate[]> {
    return Promise.all(
      curated.map(async (entry) => ({ ...(await this.monitor(entry.url).get()), label: entry.label })),
    );
  }
}

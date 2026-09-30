import type { MintInfoResponse } from '@cashu-xx/shared';

export function parseInfoBody(json: unknown): { name: string; description: string } {
  const body = json as { name?: unknown; description?: unknown };
  return {
    name: typeof body?.name === 'string' ? body.name : 'unknown mint',
    description: typeof body?.description === 'string' ? body.description : '',
  };
}

export function parseKeysBody(json: unknown): { feePpk: number } {
  const body = json as { keysets?: unknown };
  const keysets = Array.isArray(body?.keysets) ? body.keysets : [];
  for (const entry of keysets) {
    const keyset = entry as { unit?: unknown; input_fee_ppk?: unknown };
    if (keyset?.unit === 'sat' && typeof keyset?.input_fee_ppk === 'number') {
      return { feePpk: keyset.input_fee_ppk };
    }
  }
  return { feePpk: 0 };
}

export async function verifyMint(mintUrl: string): Promise<MintInfoResponse> {
  try {
    const [infoRes, keysRes] = await Promise.all([fetch(`${mintUrl}/v1/info`), fetch(`${mintUrl}/v1/keys`)]);
    if (!infoRes.ok || !keysRes.ok) {
      return { online: false, name: '', description: '', feePpk: 0, error: 'mint unreachable' };
    }
    const info = parseInfoBody(await infoRes.json());
    const keys = parseKeysBody(await keysRes.json());
    return {
      online: true,
      name: info.name,
      description: info.description,
      feePpk: keys.feePpk,
    };
  } catch (err) {
    return { online: false, name: '', description: '', feePpk: 0, error: (err as Error).message };
  }
}

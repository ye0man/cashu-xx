/**
 * Mint discovery: the curated starting list plus URL helpers shared by the
 * client (picker UI) and the server (discovery + session validation).
 *
 * Discovery is intentionally dependency-free: the list below is a small set of
 * well-known public mints, and operators can add their own at runtime by
 * pasting a URL in the picker. Every candidate is verified live against NUT-06
 * (`/v1/info`) and NUT-02 (`/v1/keysets`) before it can be selected.
 */

/** Default mint when the player does not choose one (matches the game's origin). */
export const DEFAULT_MINT_URL = 'https://mint.minibits.cash/Bitcoin';

export interface CuratedMint {
  url: string;
  label: string;
  /** Short, player-facing note shown under the name. */
  description?: string;
}

/**
 * The bundled starting list. Order matters — the first entry is the default.
 * These are not endorsed: the picker shows live online status and fees. Mints
 * that charge an input fee are fine — the fee is simply taken out of the sats
 * the player can redeem (see the server's bundle split).
 */
export const CURATED_MINTS: CuratedMint[] = [
  {
    url: DEFAULT_MINT_URL,
    label: 'Minibits',
    description: 'default · best-effort beta mint',
  },
  {
    url: 'https://mint.cashu.space',
    label: 'cashu.space',
    description: 'reference cdk mint',
  },
  {
    url: 'https://mint.coinos.io',
    label: 'Coinos',
    description: 'input fees apply',
  },
  {
    url: 'https://mint.lnvoltz.com',
    label: 'Voltz',
    description: 'input fees apply',
  },
  {
    url: 'https://8333.space:3338',
    label: '8333.space',
    description: 'community test mint',
  },
];

/**
 * Canonical form used everywhere a mint URL is stored or compared: http(s),
 * host lower-cased, no trailing slash, no query/hash. Throws on anything that
 * is not a usable mint URL so callers can turn it into a friendly error.
 */
export function normalizeMintUrl(input: string): string {
  const raw = input.trim();
  if (raw.length === 0) {
    throw new Error('mint URL is empty');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('mint URL must be a valid http(s) address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('mint URL must start with http:// or https://');
  }
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host.toLowerCase()}${path}`;
}

/** Non-throwing form of {@link normalizeMintUrl}. */
export function isValidMintUrl(input: unknown): boolean {
  if (typeof input !== 'string') {
    return false;
  }
  try {
    normalizeMintUrl(input);
    return true;
  } catch {
    return false;
  }
}

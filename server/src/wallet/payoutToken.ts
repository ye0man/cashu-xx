import { getEncodedToken, type Token } from '@cashu/cashu-ts';

/**
 * Every token that leaves the server (the player's payout, operator sweeps) is
 * a V4 `cashuB…` token with the DLEQ proofs stripped: CBOR plus no DLEQ keeps a
 * few-proof token around 300–450 chars, small enough for a phone to scan from
 * a QR. Wallet-side DLEQ verification is optional (NUT-12), so dropping it
 * trades an offline check for a token that actually fits a QR.
 */
export function encodePayoutToken(token: Token): string {
  return getEncodedToken(
    { mint: token.mint, unit: token.unit ?? 'sat', proofs: token.proofs, ...(token.memo ? { memo: token.memo } : {}) },
    { removeDleq: true },
  );
}

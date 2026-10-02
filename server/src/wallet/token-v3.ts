/**
 * Token encoding for anything that leaves the server (players and the
 * operator).
 *
 * coco encodes tokens in the new V4 CBOR format (`cashuB…`) via cashu-ts v5 —
 * which most wallets in the wild cannot parse yet and report as invalid. The
 * classic V3 JSON format (`cashuA…`) is understood everywhere, so every token
 * we hand out is re-encoded here. Amounts become plain JSON numbers, the
 * canonical V3 form; `dleq` proofs ride along when present (NUT-12).
 */

export interface V3ProofInput {
  id: string;
  /** cashu-ts Amount instance, number, string, or bigint — serialized as a JSON number. */
  amount: unknown;
  secret: string;
  C: string;
  witness?: unknown;
  dleq?: unknown;
}

export interface V3TokenInput {
  mint: string;
  proofs: V3ProofInput[];
  unit?: string;
}

function toAmountNumber(amount: unknown): number {
  if (typeof amount === 'number') {
    return amount;
  }
  if (typeof amount === 'string' || typeof amount === 'bigint') {
    return Number(amount);
  }
  // cashu-ts Amount#toJSON() yields a numeric string.
  const candidate = amount as { toJSON?: unknown };
  if (candidate && typeof candidate.toJSON === 'function') {
    return toAmountNumber((candidate as { toJSON: () => unknown }).toJSON());
  }
  const value = Number(amount);
  if (Number.isNaN(value)) {
    throw new Error(`cannot serialize proof amount: ${String(amount)}`);
  }
  return value;
}

/**
 * The wallet library's Proof objects carry extra bookkeeping (mintUrl, unit,
 * state, operation ids). None of that belongs in a NUT-00 token, and strict
 * parsers reject unknown proof fields — so rebuild each proof from the spec.
 */
function toV3Proof(proof: V3ProofInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: proof.id,
    amount: toAmountNumber(proof.amount),
    secret: proof.secret,
    C: proof.C,
  };
  if (proof.witness !== undefined) {
    out.witness = proof.witness;
  }
  if (proof.dleq !== undefined) {
    out.dleq = proof.dleq;
  }
  return out;
}

export function encodeV3Token(token: V3TokenInput): string {
  const body = {
    token: [
      {
        mint: token.mint,
        proofs: token.proofs.map(toV3Proof),
      },
    ],
    unit: token.unit ?? 'sat',
  };
  return `cashuA${Buffer.from(JSON.stringify(body)).toString('base64url')}`;
}

import { describe, expect, it } from 'vitest';
import { encodeV3Token } from '../src/wallet/token-v3';

function decodeV3(token: string): { token: Array<{ mint: string; proofs: unknown[] }>; unit: string } {
  return JSON.parse(Buffer.from(token.slice(6), 'base64url').toString('utf8'));
}

describe('encodeV3Token', () => {
  it('encodes the universal V3 format (cashuA JSON) with number amounts', () => {
    const token = encodeV3Token({
      mint: 'https://mint.test',
      unit: 'sat',
      proofs: [
        { id: 'ks-1', amount: 8, secret: 's1', C: '02aa' },
        { id: 'ks-1', amount: 2, secret: 's2', C: '02bb' },
      ],
    });
    expect(token.startsWith('cashuA')).toBe(true);
    const parsed = decodeV3(token);
    expect(parsed.token[0].mint).toBe('https://mint.test');
    expect(parsed.token[0].proofs).toHaveLength(2);
    expect(parsed.unit).toBe('sat');
    expect(parsed.token[0].proofs.every((proof) => typeof (proof as { amount: number }).amount === 'number')).toBe(
      true,
    );
  });

  it('serializes cashu-ts Amount-like values (toJSON strings) as JSON numbers', () => {
    // cashu-ts v5 amounts toJSON() into strings; V3 wallets expect numbers.
    const amountLike = { toJSON: () => '64' };
    const token = encodeV3Token({
      mint: 'https://mint.test',
      proofs: [{ id: 'ks-1', amount: amountLike, secret: 's', C: '02cc' }],
    });
    const parsed = decodeV3(token) as { token: Array<{ proofs: Array<{ amount: number }> }> };
    expect(parsed.token[0].proofs[0].amount).toBe(64);
  });

  it('strips the wallet library bookkeeping fields from proofs', () => {
    const token = encodeV3Token({
      mint: 'https://mint.test',
      proofs: [
        {
          id: 'ks-1',
          amount: 8,
          secret: 's',
          C: '02aa',
          // coco's Proof carries these; they are not part of NUT-00.
          mintUrl: 'https://mint.test',
          unit: 'sat',
          state: 'ready',
          usedByOperationId: 'op-1',
          createdByOperationId: 'op-2',
        } as never,
      ],
    });
    const parsed = decodeV3(token) as { token: Array<{ proofs: Array<Record<string, unknown>> }> };
    const proof = parsed.token[0].proofs[0];
    expect(Object.keys(proof).sort()).toEqual(['C', 'amount', 'id', 'secret']);
  });
});

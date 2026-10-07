import type { Manager } from '@cashu/coco-core';

export type PreparedSend = Awaited<ReturnType<Manager['ops']['send']['prepare']>>;

/** A payout token above this many proofs gets the wallet consolidated first. */
export const MAX_TOKEN_PROOFS = 5;
/** Keep a consolidation swap well under typical mint input limits. */
const MAX_CONSOLIDATION_INPUTS = 200;

export async function spendableSats(manager: Manager, mintUrl: string): Promise<number> {
  const balances = await manager.wallet.balances.byMint();
  const snapshot = (balances as Record<string, { spendable: unknown } | undefined>)[mintUrl];
  return snapshot ? Number(snapshot.spendable) : 0;
}

async function cancelIfPrepared(manager: Manager, operationId: string): Promise<void> {
  try {
    const current = await manager.ops.send.get(operationId);
    if (current?.state === 'prepared') {
      await manager.ops.send.cancel(operationId);
    }
  } catch {
    // best effort: a stuck prepared op only reserves proofs until the next boot recovery
  }
}

/**
 * Swap the wallet's loose proofs into a minimal set of denominations.
 *
 * coco skips the swap whenever existing proofs already add up to a send
 * amount exactly, so many small 2- and 4-sat proofs pile up and get handed out
 * as-is. Sending the whole spendable balance (an exact match: no swap) and then
 * reclaiming it forces one swap, whose outputs are the canonical power-of-two
 * split. Returns how many proofs went in, or 0 when there was nothing to do.
 */
export async function consolidateProofs(manager: Manager, mintUrl: string): Promise<number> {
  let amount = await spendableSats(manager, mintUrl);
  while (amount > 0) {
    const prepared = await manager.ops.send.prepare({ mintUrl, amount, unit: 'sat' });
    if (prepared.needsSwap || prepared.inputProofSecrets.length <= 1) {
      // A swap here would already be compact, and a single proof is as small as it gets.
      await cancelIfPrepared(manager, prepared.id);
      return 0;
    }
    if (prepared.inputProofSecrets.length > MAX_CONSOLIDATION_INPUTS) {
      await cancelIfPrepared(manager, prepared.id);
      amount = Math.floor(amount / 2);
      continue;
    }
    const inputs = prepared.inputProofSecrets.length;
    await manager.ops.send.execute(prepared);
    // The token never leaves the server: reclaiming it is the swap we want.
    await manager.ops.send.reclaim(prepared.id);
    return inputs;
  }
  return 0;
}

/**
 * Prepare a send whose token carries few proofs: if coco would hand out a long
 * exact-match list of small proofs, consolidate the wallet and prepare again.
 */
export async function prepareCompactSend(manager: Manager, mintUrl: string, amount: number): Promise<PreparedSend> {
  const prepared = await manager.ops.send.prepare({ mintUrl, amount, unit: 'sat' });
  if (prepared.needsSwap || prepared.inputProofSecrets.length <= MAX_TOKEN_PROOFS) {
    return prepared;
  }
  await cancelIfPrepared(manager, prepared.id);
  await consolidateProofs(manager, mintUrl);
  return manager.ops.send.prepare({ mintUrl, amount, unit: 'sat' });
}

export { cancelIfPrepared };

import { isDeadBundleState, type BundleState, type MilestoneId } from '@cashu-xx/shared';

/**
 * Pure planning for the operator withdrawal: works out which in-flight wallet
 * sends belong to which game bundles, which are orphans (e.g. a previous
 * withdrawal token), and which bundles can never be swept. No I/O here so it can
 * be unit-tested; `wallet-cli.ts` does the talking to coco and the mint.
 */

export interface BundleTokenInfo {
  sessionId: string;
  milestoneId: MilestoneId;
  state: BundleState;
  /** Mint the session (and therefore this token) is locked to. */
  mintUrl: string;
  /** Decoded proof secrets, or null when the token could not be decoded (e.g. a mock token). */
  secrets: string[] | null;
  sats: number;
}

export interface SendOpInfo {
  id: string;
  state: string;
  amount: number;
  /** Mint this send belongs to. */
  mintUrl: string;
  /** Proof secrets of the token handed out by this send (empty if the op has no token). */
  secrets: string[];
}

export interface MatchedSend {
  op: SendOpInfo;
  bundle: BundleTokenInfo;
}

export interface WithdrawPlan {
  /** In-flight sends that still back an unredeemed pre-ledger game token. */
  matched: MatchedSend[];
  /** In-flight sends with no matching bundle — e.g. a prior withdrawal token. */
  orphanSends: SendOpInfo[];
  /** In-flight sends backing a player's issued payout token: never swept. */
  protectedSends: SendOpInfo[];
  /** Bundles that cannot be swept: already redeemed, or not real tokens. */
  unsweepable: BundleTokenInfo[];
  totals: {
    matchedSats: number;
    orphanSats: number;
    protectedSats: number;
    alreadyReclaimedSats: number;
    undecodableBundles: number;
    redeemedBundles: number;
    lockedBundles: number;
    issuedBundles: number;
  };
  warnings: string[];
}

/**
 * @param bundles pre-ledger bundles (rows that carry a stored token)
 * @param sends every in-flight send in the wallet
 * @param protectedOpIds send ops backing issued player payout tokens
 */
export function planWithdraw(
  bundles: BundleTokenInfo[],
  sends: SendOpInfo[],
  protectedOpIds: ReadonlySet<string> = new Set(),
): WithdrawPlan {
  const dead = (bundle: BundleTokenInfo): boolean => isDeadBundleState(bundle.state);
  const bySecret = new Map<string, BundleTokenInfo>();
  for (const bundle of bundles) {
    if (dead(bundle) || !bundle.secrets) {
      continue;
    }
    for (const secret of bundle.secrets) {
      bySecret.set(secret, bundle);
    }
  }

  const matched: MatchedSend[] = [];
  const orphanSends: SendOpInfo[] = [];
  const protectedSends: SendOpInfo[] = [];
  const matchedBundles = new Set<BundleTokenInfo>();

  for (const op of sends) {
    if (protectedOpIds.has(op.id)) {
      protectedSends.push(op);
      continue;
    }
    const bundle = op.secrets.map((secret) => bySecret.get(secret)).find((found) => found !== undefined);
    if (bundle && !matchedBundles.has(bundle)) {
      matchedBundles.add(bundle);
      matched.push({ op, bundle });
    } else {
      orphanSends.push(op);
    }
  }

  const unsweepable = bundles.filter((bundle) => !dead(bundle) && !matchedBundles.has(bundle));
  const redeemed = unsweepable.filter((bundle) => bundle.secrets !== null).length;
  const undecodable = bundles.filter((bundle) => bundle.secrets === null && !dead(bundle));

  const warnings: string[] = [];
  if (undecodable.length > 0) {
    warnings.push(
      `${undecodable.length} stored token(s) are not real tokens for this mint (mock/other) and are left alone.`,
    );
  }

  // Counts over real tokens only, so mock rows never inflate the picture.
  const real = bundles.filter((bundle) => bundle.secrets !== null && !dead(bundle));

  return {
    matched,
    orphanSends,
    protectedSends,
    unsweepable,
    totals: {
      matchedSats: matched.reduce((sum, m) => sum + m.op.amount, 0),
      orphanSats: orphanSends.reduce((sum, op) => sum + op.amount, 0),
      protectedSats: protectedSends.reduce((sum, op) => sum + op.amount, 0),
      alreadyReclaimedSats: bundles.filter(dead).reduce((sum, b) => sum + b.sats, 0),
      undecodableBundles: undecodable.length,
      redeemedBundles: redeemed,
      lockedBundles: real.filter((b) => b.state === 'locked').length,
      issuedBundles: real.filter((b) => b.state === 'unlocked').length,
    },
    warnings,
  };
}

/** Human-readable dry-run summary of what a withdrawal would do. */
export function formatPlan(plan: WithdrawPlan): string[] {
  const { totals } = plan;
  const lines = [
    `Unredeemed pre-ledger tokens       : ${plan.matched.length} (${totals.matchedSats} sats)`,
  ];
  if (plan.orphanSends.length > 0) {
    lines.push(`Orphan sends (old withdrawal?)     : ${plan.orphanSends.length} (${totals.orphanSats} sats)`);
  }
  if (plan.protectedSends.length > 0) {
    lines.push(`Player payout tokens (kept)        : ${plan.protectedSends.length} (${totals.protectedSats} sats)`);
  }
  if (totals.alreadyReclaimedSats > 0) {
    lines.push(`Already reclaimed (skipped)        : ${totals.alreadyReclaimedSats} sats`);
  }
  if (totals.redeemedBundles > 0) {
    lines.push(`Already redeemed by players (skip) : ${totals.redeemedBundles} bundle(s)`);
  }
  if (totals.undecodableBundles > 0) {
    lines.push(`Not real tokens, e.g. mock (skip)  : ${totals.undecodableBundles} bundle(s)`);
  }
  lines.push(
    `Real tokens in game                : ${totals.lockedBundles} never revealed, ${totals.issuedBundles} revealed but unredeemed`,
  );
  for (const warning of plan.warnings) {
    lines.push(`WARNING: ${warning}`);
  }
  return lines;
}

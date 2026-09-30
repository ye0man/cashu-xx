import type { MilestoneId } from './milestones';
import type { BundleState } from './session';

export interface LedgerRow {
  milestoneId: MilestoneId;
  state: BundleState;
  unlockedAt: number | null;
  issuedAt: number | null;
}

import type { MilestoneId } from '@cashu-xx/shared';
import { MILESTONE_IDS } from '@cashu-xx/shared';
import { worldState } from './save';

export const STORY_FLAGS = {
  metHickory: 'met_hickory',
  rfcDone: 'rfc_done',
  issueOpened: 'issue_opened',
  prOpened: 'pr_opened',
  awaitingImpl: 'awaiting_impl',
  recordFound: 'record_found',
  djmacAsked: 'djmac_asked',
} as const;

export function hasFlag(flag: string): boolean {
  return worldState.flags.has(flag);
}

export function setFlag(flag: string): void {
  worldState.flags.add(flag);
}

export interface Journal {
  issueOpened: boolean;
  prOpened: boolean;
  reviews: number;
  awaitingImpl: boolean;
  impls: number;
  merged: boolean;
}

export function getJournal(): Journal {
  const f = worldState.flags;
  return {
    issueOpened: f.has(STORY_FLAGS.issueOpened),
    prOpened: f.has(STORY_FLAGS.prOpened),
    reviews: countOf(f, ['djmac-record', 'kimi-test']),
    awaitingImpl: f.has(STORY_FLAGS.awaitingImpl),
    impls: countOf(f, ['impl-rusty', 'impl-coco', 'impl-pip']),
    merged: f.has('ceremony'),
  };
}

export function isMilestoneEarned(id: MilestoneId): boolean {
  return worldState.flags.has(id);
}

export function earnedMilestones(): MilestoneId[] {
  return MILESTONE_IDS.filter((id) => isMilestoneEarned(id));
}

export function hiddenFound(): number {
  return countOf(worldState.flags, ['hidden-pos', 'hidden-library', 'hidden-tower', 'hidden-booth']);
}

function countOf(flags: Set<string>, ids: string[]): number {
  return ids.filter((id) => flags.has(id)).length;
}

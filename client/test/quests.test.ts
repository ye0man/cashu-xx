import { MILESTONE_IDS } from '@cashu-xx/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { STORY_FLAGS, getJournal, hasFlag, hiddenFound, isMilestoneEarned, setFlag } from '../src/systems/quests';
import { worldState } from '../src/systems/save';

describe('quest engine', () => {
  beforeEach(() => {
    worldState.flags = new Set();
    worldState.readSigns = new Set();
  });

  it('derives an empty journal for a fresh game', () => {
    const journal = getJournal();
    expect(journal).toEqual({
      issueOpened: false,
      prOpened: false,
      reviews: 0,
      awaitingImpl: false,
      impls: 0,
      merged: false,
    });
  });

  it('counts reviews at two, impls at two, and the merge', () => {
    setFlag('djmac-record');
    setFlag('kimi-test');
    setFlag('impl-rusty');
    setFlag('impl-pip');
    setFlag('ceremony');
    const journal = getJournal();
    expect(journal.reviews).toBe(2);
    expect(journal.impls).toBe(2);
    expect(journal.merged).toBe(true);
  });

  it('tracks hidden tokens and milestone earnings', () => {
    setFlag('hidden-pos');
    setFlag('hidden-tower');
    expect(hiddenFound()).toBe(2);
    expect(isMilestoneEarned('hidden-pos')).toBe(true);
    expect(isMilestoneEarned('hidden-booth')).toBe(false);
    expect(MILESTONE_IDS.every((id) => typeof id === 'string')).toBe(true);
  });

  it('uses milestone ids as flags for token milestones', () => {
    setFlag('impl-coco');
    expect(hasFlag('impl-coco')).toBe(true);
    expect(isMilestoneEarned('impl-coco')).toBe(true);
    expect(hasFlag(STORY_FLAGS.recordFound)).toBe(false);
  });
});

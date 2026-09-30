export const MILESTONE_IDS = [
  'impl-rusty',
  'impl-coco',
  'impl-pip',
  'djmac-record',
  'kimi-test',
  'ceremony',
  'hidden-pos',
  'hidden-library',
  'hidden-tower',
  'hidden-booth',
] as const;

export type MilestoneId = (typeof MILESTONE_IDS)[number];

export const ENTRY_AMOUNT_SATS = 100;
export const TOKEN_AMOUNT_SATS = 10;
export const BUNDLE_COUNT = MILESTONE_IDS.length;

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

export const MILESTONE_LABELS: Record<MilestoneId, string> = {
  'impl-rusty': "Rusty's impl PR",
  'impl-coco': "Coco's impl PR",
  'impl-pip': "Pip's impl PR",
  'djmac-record': "DJ Mac's record",
  'kimi-test': "Kimi's test",
  ceremony: 'Merge ceremony',
  'hidden-pos': 'Hidden token #1',
  'hidden-library': 'Hidden token #2',
  'hidden-tower': 'Hidden token #3',
  'hidden-booth': 'Hidden token #4',
};

export const ENTRY_AMOUNT_SATS = 100;
export const TOKEN_AMOUNT_SATS = 10;
export const BUNDLE_COUNT = MILESTONE_IDS.length;

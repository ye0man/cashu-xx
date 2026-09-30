import type { DialogueChoice } from '../systems/dialogue';

export interface ChallengeQuestion {
  prompt: string;
  speaker: string;
  choices: DialogueChoice[];
  correctChoiceId: string;
  retryHint: string;
}

export const RFC_2119_QUESTIONS: ChallengeQuestion[] = [
  {
    speaker: 'PROF. HICKORY',
    prompt: 'Question one. Reviews are not optional. Before merge, you ___ get reviews.',
    choices: [
      { id: 'must', label: 'MUST' },
      { id: 'should', label: 'SHOULD' },
      { id: 'may', label: 'MAY' },
    ],
    correctChoiceId: 'must',
    retryHint: 'Not quite. Two approving reviews are an absolute requirement. MUST.',
  },
  {
    speaker: 'PROF. HICKORY',
    prompt: 'Question two. Once you have consensus, you ___ open implementation PRs.',
    choices: [
      { id: 'must', label: 'MUST' },
      { id: 'should', label: 'SHOULD' },
      { id: 'may', label: 'MAY' },
    ],
    correctChoiceId: 'should',
    retryHint: 'Strong recommendation, not law. Implementation PRs SHOULD follow consensus.',
  },
  {
    speaker: 'PROF. HICKORY',
    prompt: 'Question three. A third implementation ___ show up before merge.',
    choices: [
      { id: 'must', label: 'MUST' },
      { id: 'should', label: 'SHOULD' },
      { id: 'may', label: 'MAY' },
    ],
    correctChoiceId: 'may',
    retryHint: 'Two is the gate. Anything beyond that? Truly optional. MAY.',
  },
];

export const SWAP_PUZZLE_QUESTIONS: ChallengeQuestion[] = [
  {
    speaker: 'RUSTY',
    prompt: 'Hmph. Kiosk wants EXACTLY 10 sats. You hold proofs of 8, 2 and 32. Hand over:',
    choices: [
      { id: 'eight-two', label: 'the 8 and the 2' },
      { id: 'thirty-two', label: 'the 32' },
      { id: 'all', label: 'all three' },
    ],
    correctChoiceId: 'eight-two',
    retryHint: '8 + 2 = 10. Exact change. Try again, claws up.',
  },
  {
    speaker: 'RUSTY',
    prompt: 'Now you hold one 64. Kiosk wants 10. First move?',
    choices: [
      { id: 'swap-down', label: 'swap the 64 for smaller proofs' },
      { id: 'hand-over', label: 'hand over the 64, hope for change' },
      { id: 'cut', label: 'cut a 10 out of the 64' },
    ],
    correctChoiceId: 'swap-down',
    retryHint: 'You can’t carve proofs. Swap the big one down, then pay. Again.',
  },
  {
    speaker: 'RUSTY',
    prompt: 'Last one. Pay EXACTLY 24 using one swap of your 32.',
    choices: [
      { id: 'sixteen-eight', label: 'swap into 16 + 8, pay both' },
      { id: 'bad-sum', label: 'swap into 16 + 8, pay the 16' },
      { id: 'thirty-two', label: 'swap into 32 + 8, pay both' },
    ],
    correctChoiceId: 'sixteen-eight',
    retryHint: '16 + 8 = 24. No sats left behind. Recount and retry.',
  },
];

export interface ShellRound {
  prompt: string;
  correctShell: 1 | 2 | 3;
  retryHint: string;
}

export const SHELL_GAME_ROUNDS: ShellRound[] = [
  {
    prompt: 'Round one. Watch closely... the blinded message is under shell 2. Which shell?',
    correctShell: 2,
    retryHint: 'Shell 2. I barely even shuffled. Eyes on the coconut.',
  },
  {
    prompt: 'Round two. Under shell 1... now I swap shell 1 with shell 3. Which shell holds it?',
    correctShell: 3,
    retryHint: 'It started at 1, and 1 traded places with 3. So: shell 3.',
  },
  {
    prompt: 'Round three. Under shell 2. I swap 2 with 1, then 1 with 3. Where is it?',
    correctShell: 3,
    retryHint: '2→1 after the first swap, then 1→3 after the second. Shell 3!',
  },
];

export const BLIND_SIGNATURE_QUESTIONS: ChallengeQuestion[] = [
  {
    speaker: 'COCO',
    prompt: 'Okay but why can’t the mint spend your tokens? It signed them!',
    choices: [
      { id: 'blinded', label: 'it signed a blinded message — never saw the serial' },
      { id: 'forgot', label: 'the mint forgot its own key' },
      { id: 'vibes', label: 'tokens are just vibes' },
    ],
    correctChoiceId: 'blinded',
    retryHint: 'Close! The signature goes on something the mint cannot read. Blinding!',
  },
  {
    speaker: 'COCO',
    prompt: 'To unblind that signature, what do you bring to the table?',
    choices: [
      { id: 'factor', label: 'my secret blinding factor' },
      { id: 'mint-key', label: 'the mint’s private key (borrowed)' },
      { id: 'vpn', label: 'a VPN, obviously' },
    ],
    correctChoiceId: 'factor',
    retryHint: 'The blinding factor is yours alone. That’s the whole trick.',
  },
];

export const TRACE_ORDER: string[] = [
  'Open a mint quote',
  'Pay the invoice',
  'Mint the proofs',
  'Swap into bundles',
  'Melt back to sats',
];

export const TRACE_CORRECT: string[] = [...TRACE_ORDER];

export const PIP_SCRIPT_QUESTION: ChallengeQuestion = {
  speaker: 'PIP',
  prompt: 'Last. My verifier is off by one philosophy. Which step is WRONG in: "verify, unblind, keep, spend"?',
  choices: [
    { id: 'keep-first', label: 'keep before unblind' },
    { id: 'verify-first', label: 'verify first' },
    { id: 'spend-last', label: 'spend last' },
  ],
  correctChoiceId: 'keep-first',
  retryHint: 'You cannot keep what you have not unblinded. Unblind, THEN keep.',
};

export const DISCLOSURE_SCENARIOS: ChallengeQuestion[] = [
  {
    speaker: 'KIMI',
    prompt:
      'Scenario one. You find a bug that mints unlimited ecash at a live mint. You:',
    choices: [
      { id: 'report', label: 'tell the operator privately, touch nothing' },
      { id: 'drain', label: 'drain it first — finders keepers' },
      { id: 'tweet', label: 'post the PoC publicly, day one' },
    ],
    correctChoiceId: 'report',
    retryHint: 'Private disclosure. No draining. No public PoC. Ever.',
  },
  {
    speaker: 'KIMI',
    prompt: 'Scenario two. A friend wants to demo the bug on mainnet “just once”. You:',
    choices: [
      { id: 'testnet', label: 'refuse — reproduce it on testnet instead' },
      { id: 'once', label: 'once is fine, record it for the blog' },
      { id: 'split', label: 'agree, if you split the sats' },
    ],
    correctChoiceId: 'testnet',
    retryHint: 'Mainnet is not a sandbox. Testnet or it didn’t happen.',
  },
  {
    speaker: 'KIMI',
    prompt: 'Scenario three. The operator goes silent for weeks. You:',
    choices: [
      { id: 'escalate', label: 'wait longer, escalate to the community' },
      { id: 'publish', label: 'publish immediately — they had their chance' },
      { id: 'exploit', label: 'become the operator' },
    ],
    correctChoiceId: 'escalate',
    retryHint: 'Give it time. Escalate politely. Publish only as a last resort.',
  },
];

export const CHALLENGE_SPEAKERS = {
  rfc: 'PROF. HICKORY',
  swap: 'RUSTY',
  shell: 'COCO',
  trace: 'PIP',
  disclosure: 'KIMI',
} as const;

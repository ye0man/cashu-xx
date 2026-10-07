import type { MilestoneId } from '@cashu-xx/shared';
import {
  BLIND_SIGNATURE_QUESTIONS,
  DISCLOSURE_SCENARIOS,
  PIP_SCRIPT_QUESTION,
  RFC_2119_QUESTIONS,
  SHELL_GAME_ROUNDS,
  SWAP_PUZZLE_QUESTIONS,
  TRACE_CORRECT,
} from '../data/challenges';
import type { PickupSpot } from '../data/maps';
import type { DialogManager } from '../ui/DialogManager';
import { pixelText } from '../ui/text';
import { audio } from './audio';
import { runQuestions, runShellRounds, runTraceOrder } from './challenges';
import { STORY_FLAGS, earnedMilestones, getJournal, hasFlag, hiddenFound, setFlag } from './quests';
import { showTokenClaim } from './tokens';

export interface StoryContext {
  scene: Phaser.Scene;
  dialog: DialogManager;
  showToast: (message: string) => void;
  openTokenBank: () => void;
}

export function talkTo(npcId: string, ctx: StoryContext): void {
  void runTalk(npcId, ctx);
}

export function touchPickup(spot: PickupSpot, ctx: StoryContext): void {
  void runPickup(spot, ctx);
}

async function runTalk(npcId: string, ctx: StoryContext): Promise<void> {
  switch (npcId) {
    case 'hickory':
      return talkHickory(ctx);
    case 'rusty':
      return talkRusty(ctx);
    case 'coco':
      return talkCoco(ctx);
    case 'pip':
      return talkPip(ctx);
    case 'djmac':
      return talkDjMac(ctx);
    case 'kimi':
      return talkKimi(ctx);
    case 'receptionist':
      return talkReceptionist(ctx);
    default:
      return;
  }
}

async function runPickup(spot: PickupSpot, ctx: StoryContext): Promise<void> {
  if (hasFlag(spot.flag)) {
    return;
  }
  if (spot.id === 'pickup-record') {
    setFlag(STORY_FLAGS.recordFound);
    ctx.showToast('Got the vinyl record');
    audio.playSfx('sfx-item');
    await ctx.dialog.openAsync({
      lines: ['You found DJ Mac’s record! The B-side smells like espresso. Return it to the club!'],
    });
    return;
  }
  ctx.showToast('Hidden token found!');
  await ctx.dialog.openAsync({
    lines: ['You found a hidden cashu token under the dust!'],
  });
  await showTokenClaim(ctx, spot.milestoneId as MilestoneId);
}

async function talkHickory(ctx: StoryContext): Promise<void> {
  const dialog = ctx.dialog;
  if (!hasFlag(STORY_FLAGS.metHickory)) {
    await dialog.openAsync({
      speaker: 'PROF. HICKORY',
      lines: [
        'Ah! XX, my dear placeholder! Every great NUT starts as an XX. It’s not an insult. It’s a draft.',
        'You wrote a spec change: a new kind of spending condition. Vague? Slightly. Mergeable? We’ll see.',
        'First we open an issue — big changes like an audience. But before that: a small exam. RFC 2119!',
      ],
    });
    await runQuestions(dialog, RFC_2119_QUESTIONS);
    setFlag(STORY_FLAGS.metHickory);
    setFlag(STORY_FLAGS.rfcDone);
    setFlag(STORY_FLAGS.issueOpened);
    await dialog.openAsync({
      speaker: 'PROF. HICKORY',
      lines: [
        'Issue opened! The community can weigh in now.',
        'Come back when you’re ready to open the PR. Title it NUT-XX — placeholder until the maintainers assign a number.',
      ],
    });
    return;
  }

  if (!hasFlag(STORY_FLAGS.prOpened)) {
    setFlag(STORY_FLAGS.prOpened);
    await dialog.openAsync({
      speaker: 'PROF. HICKORY',
      lines: [
        'NUT-XX: a spending condition. Nice ring. The PR is open!',
        'Now the scary part: review. You need TWO approving reviews from maintainers. Not one. Two.',
        'DJ Mac holds court at the club near the south. Kimi... ask the signs near the old red line.',
      ],
    });
    return;
  }

  const journal = getJournal();
  if (journal.reviews < 2 && !journal.awaitingImpl) {
    await dialog.openAsync({
      speaker: 'PROF. HICKORY',
      lines: [
        `Reviews so far: ${journal.reviews}/2. Bug them kindly. One lost record, one security test...`,
        'DJ Mac at the club. Kimi near the closed red line. Bring snacks.',
      ],
    });
    return;
  }

  if (journal.awaitingImpl && journal.impls < 2) {
    await dialog.openAsync({
      speaker: 'PROF. HICKORY',
      lines: [
        `Your PR is labeled "Awaiting Implementation PRs". Implementation PRs: ${journal.impls}/2.`,
        'Rusty builds on cdk at the dockyard. Coco ships cashu-ts from the Palm House. Pip maintains nutshell in the library.',
        'CONVINCE TWO OF THE THREE. That’s the gate. Two implementations, then merge. Not before.',
      ],
    });
    return;
  }

  if (journal.impls >= 2 && !journal.merged) {
    await runCeremony(ctx);
    return;
  }

  const earned = earnedMilestones().length;
  const choices = [{ id: 'wait', label: 'Not yet' }];
  if (earned > 0) {
    choices.unshift({
      id: 'bundle',
      label: `Bundle my ${earned} token${earned === 1 ? '' : 's'} into one (ends the run)`,
    });
  }

  const choice = await dialog.openAsync({
    speaker: 'PROF. HICKORY',
    lines: [
      earned >= 10
        ? 'The ledger is spotless: 10/10 tokens. One ritual remains: the bundling.'
        : `NUT-31! The spec survives because three codebases hum in tune. Tokens: ${earned}/10.`,
      'Hand me your tokens and I’ll fold them into ONE cashu token. Scan it once and every sat is yours.',
    ],
    choices,
  });
  if (choice !== 'bundle') {
    await dialog.openAsync({
      speaker: 'PROF. HICKORY',
      lines: ['Take your time. The mint is patient. Mostly.'],
    });
    return;
  }
  if (earned < 10) {
    const sure = await dialog.openAsync({
      speaker: 'PROF. HICKORY',
      lines: [
        `${10 - earned} token${10 - earned === 1 ? ' is' : 's are'} still out there. Bundling ends the run, and unfound tokens stay with the mint.`,
      ],
      choices: [
        { id: 'go', label: `Bundle my ${earned * 10} sats now` },
        { id: 'wait', label: 'Keep exploring' },
      ],
    });
    if (sure !== 'go') {
      return;
    }
  }
  await runFinale(ctx, earned);
}

async function runFinale(ctx: StoryContext, earned: number): Promise<void> {
  const dialog = ctx.dialog;
  audio.playTheme('ceremony');
  await dialog.openAsync({
    speaker: 'PROF. HICKORY',
    lines: [
      `Then it is time. ${earned} token${earned === 1 ? '' : 's'} in. One token out.`,
      'Watch closely: the proofs swap, the sats regroup, and a spec stands on its own two feet.',
    ],
  });
  flashNumber(ctx, 'BUNDLE');
  await delay(2100);
  // The ending scene mints the combined token and shows it as one QR.
  ctx.scene.scene.start('EndingScene');
}

async function runCeremony(ctx: StoryContext): Promise<void> {
  const dialog = ctx.dialog;
  audio.playTheme('ceremony');
  await dialog.openAsync({
    speaker: 'PROF. HICKORY',
    lines: [
      'Two implementation PRs — marked Ready to Merge. Consensus reached. The label has done its work.',
      'Everyone who helped: to the lab. The ceremony begins.',
    ],
  });
  if (hasFlag('impl-rusty')) {
    await dialog.openAsync({ speaker: 'RUSTY', lines: ['*snip snip* My claws reviewed every line. Ship it.'] });
  }
  if (hasFlag('impl-coco')) {
    await dialog.openAsync({ speaker: 'COCO', lines: ['Typed, tested, tender. The toolkit approves!'] });
  }
  if (hasFlag('impl-pip')) {
    await dialog.openAsync({ speaker: 'PIP', lines: ['Spec first, then implementations, then merge. As documented.'] });
  }
  if (hasFlag('djmac-record')) {
    await dialog.openAsync({ speaker: 'DJ MAC', lines: ['And the B-side plays us out! ACK!'] });
  }
  if (hasFlag('kimi-test')) {
    await dialog.openAsync({ speaker: 'KIMI', lines: ['Reviewed. No open vulns in your prose. ACK.'] });
  }
  await dialog.openAsync({
    speaker: 'PROF. HICKORY',
    lines: [
      'By the power vested in me by two reviewers and two implementations...',
      'Your PR is merged. The spec PR merges first; the implementations follow. That is the law.',
      'You are no longer XX.',
    ],
  });
  flashNumber(ctx, 'NUT-31');
  await delay(2100);
  await dialog.openAsync({
    speaker: 'PROF. HICKORY',
    lines: ['The maintainers assigned your number: NUT-31. Wear it well. Go find your tokens.'],
  });
  await showTokenClaim(ctx, 'ceremony');
}

async function talkRusty(ctx: StoryContext): Promise<void> {
  const dialog = ctx.dialog;
  if (hasFlag('impl-rusty')) {
    await dialog.openAsync({ speaker: 'RUSTY', lines: ['My PR stands. If the spec drifts, I un-ACK it. With claws.'] });
    return;
  }
  if (!hasFlag(STORY_FLAGS.awaitingImpl)) {
    await dialog.openAsync({
      speaker: 'RUSTY',
      lines: ['Implementations come AFTER review. Two maintainer ACKs first. That’s the process. I don’t make the rules.'],
    });
    return;
  }
  await dialog.openAsync({
    speaker: 'RUSTY',
    lines: [
      'So YOU are the spending condition. cdk is my shed: I build ships that carry sats.',
      'Implementing your NUT means trusting your math. Show me you can swap without losing sats in the cracks. Three drills. Go.',
    ],
  });
  await runQuestions(dialog, SWAP_PUZZLE_QUESTIONS);
  setFlag('impl-rusty');
  await dialog.openAsync({
    speaker: 'RUSTY',
    lines: ['Hmph. Exact change every time. Fine — my implementation PR is up. Ready to Merge.'],
  });
  await showTokenClaim(ctx, 'impl-rusty');
  await maybeLabelAwaitingImpl(ctx);
}

async function talkCoco(ctx: StoryContext): Promise<void> {
  const dialog = ctx.dialog;
  if (hasFlag('impl-coco')) {
    await dialog.openAsync({ speaker: 'COCO', lines: ['Still shipping! cashu-ts + coco never left you on read.'] });
    return;
  }
  if (!hasFlag(STORY_FLAGS.awaitingImpl)) {
    await dialog.openAsync({
      speaker: 'COCO',
      lines: ['Love the energy, but process is process! Two ACKs from the maintainers, then we talk implementation.'],
    });
    return;
  }
  await dialog.openAsync({
    speaker: 'COCO',
    lines: [
      'You want cashu-ts AND coco to carry your spec? Bold. I love bold.',
      'First: the Blind Shuffle. Follow the message, not the shell. Then two questions, strictly for science.',
    ],
  });
  await runShellRounds(dialog, SHELL_GAME_ROUNDS);
  await runQuestions(dialog, BLIND_SIGNATURE_QUESTIONS);
  setFlag('impl-coco');
  await dialog.openAsync({
    speaker: 'COCO',
    lines: ['You tracked every swap AND you get blinding. Implementation PR: open. Ready to Merge!'],
  });
  await showTokenClaim(ctx, 'impl-coco');
  await maybeLabelAwaitingImpl(ctx);
}

async function talkPip(ctx: StoryContext): Promise<void> {
  const dialog = ctx.dialog;
  if (hasFlag('impl-pip')) {
    await dialog.openAsync({ speaker: 'PIP', lines: ['The nutshell implementation is already in review. Do not rush the shells.'] });
    return;
  }
  if (!hasFlag(STORY_FLAGS.awaitingImpl)) {
    await dialog.openAsync({
      speaker: 'PIP',
      lines: ['Process first. Two maintainer ACKs before implementation. I will wait. I am extremely good at waiting.'],
    });
    return;
  }
  await dialog.openAsync({
    speaker: 'PIP',
    lines: [
      'You want nutshell to implement a spending condition. Sit. No food near the shells.',
      'First: order the life of a proof. One wrong link and the whole chain is folklore.',
    ],
  });
  await runTraceOrder(dialog, TRACE_CORRECT);
  await runQuestions(dialog, [PIP_SCRIPT_QUESTION]);
  setFlag('impl-pip');
  await dialog.openAsync({
    speaker: 'PIP',
    lines: ['Acceptable. My implementation PR is open and documented. Ready to Merge.'],
  });
  await showTokenClaim(ctx, 'impl-pip');
  await maybeLabelAwaitingImpl(ctx);
}

async function talkDjMac(ctx: StoryContext): Promise<void> {
  const dialog = ctx.dialog;
  if (hasFlag('djmac-record')) {
    await dialog.openAsync({ speaker: 'DJ MAC', lines: ['The B-side lives! You’re on the list forever.'] });
    return;
  }
  if (hasFlag(STORY_FLAGS.recordFound)) {
    await dialog.openAsync({
      speaker: 'DJ MAC',
      lines: ['MY RECORD! My B-side! My JINGLE! You beautiful placeholder, you!', 'A deal’s a deal. Here — one cashu token. And your PR? Consider me ACK’d.'],
    });
    setFlag('djmac-record');
    await showTokenClaim(ctx, 'djmac-record');
    await maybeLabelAwaitingImpl(ctx);
    return;
  }
  setFlag(STORY_FLAGS.djmacAsked);
  await dialog.openAsync({
    speaker: 'DJ MAC',
    lines: [
      'Can’t talk, can’t mix. My record is GONE. Vinyl. The B-side had a jingle on it. A JINGLE.',
      'Last place I had it: Café Mint. Check the back corner. Bring it back and I’ll ACK that spec of yours.',
    ],
  });
}

async function talkKimi(ctx: StoryContext): Promise<void> {
  const dialog = ctx.dialog;
  if (hasFlag('kimi-test')) {
    await dialog.openAsync({ speaker: 'KIMI', lines: ['Quiet week. No new CVEs in your prose. Stay that way.'] });
    return;
  }
  await dialog.openAsync({
    speaker: 'KIMI',
    lines: [
      'You found the red line. Good. I’m Kimi. I break things professionally.',
      'Your PR adds a spending condition. Spending conditions eat bugs for breakfast, so I test YOU first. Three scenarios. All must pass.',
    ],
  });
  await runQuestions(dialog, DISCLOSURE_SCENARIOS);
  setFlag('kimi-test');
  await dialog.openAsync({
    speaker: 'KIMI',
    lines: [
      'Disciplined. Boring. Correct. Highest praise I have.',
      'Your PR is ACK’d. Here’s a token — consider it a bug bounty of one.',
    ],
  });
  await showTokenClaim(ctx, 'kimi-test');
  await maybeLabelAwaitingImpl(ctx);
}

async function talkReceptionist(ctx: StoryContext): Promise<void> {
  const dialog = ctx.dialog;
  const hidden = hiddenFound();
  const earned = earnedMilestones().length;
  const choice = await dialog.openAsync({
    speaker: 'RECEPTIONIST',
    choices: [
      { id: 'tokens', label: 'Show my tokens' },
      { id: 'report', label: 'Status report' },
      { id: 'bye', label: 'Goodbye' },
    ],
    lines: [
      earned >= 10
        ? 'NUT-31! Ledger spotless: 10/10 tokens. When you’re ready, the professor bundles them into one.'
        : `Welcome to Minibits HQ. Tokens earned: ${earned}/10. Hidden finds: ${hidden}/4.`,
    ],
  });
  if (choice === 'tokens') {
    ctx.openTokenBank();
    return;
  }
  if (choice === 'report') {
    await dialog.openAsync({
      speaker: 'RECEPTIONIST',
      lines: [
        `Hidden tokens found: ${hidden}/4. Total tokens earned: ${earned}/10.`,
        'The lobby coffee is free. The ecash is yours to find. Ask around — trash cans lie.',
        'When you’re ready to cash out, see Prof. Hickory — one combined token, one QR, done.',
      ],
    });
  }
}

async function maybeLabelAwaitingImpl(ctx: StoryContext): Promise<void> {
  const journal = getJournal();
  if (journal.reviews >= 2 && !hasFlag(STORY_FLAGS.awaitingImpl)) {
    setFlag(STORY_FLAGS.awaitingImpl);
    await ctx.dialog.openAsync({
      speaker: 'PROF. HICKORY',
      lines: [
        'TWO REVIEWS! Your PR is now labeled "Awaiting Implementation PRs".',
        'Go convince the implementers: Rusty, Coco, Pip. TWO of them suffice. That is the rule.',
      ],
    });
    ctx.showToast('PR labeled: Awaiting Implementation PRs');
  }
}

function flashNumber(ctx: StoryContext, label: string): void {
  const scene = ctx.scene;
  const cx = scene.scale.width / 2;
  const cy = scene.scale.height / 2;
  // Dim the world behind the number so it reads even against busy tiles.
  const backdrop = scene.add
    .rectangle(cx, cy, scene.scale.width, scene.scale.height, 0x120a24, 0.9)
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(119);
  const outline = pixelText(scene, cx + 3, cy + 3, label, { scale: 3, color: '#7b2fbe' })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(120);
  const text = pixelText(scene, cx, cy, label, { scale: 3, color: '#f7e7cf' })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(121);
  audio.playSfx('sfx-token');
  // Grow in whole-pixel steps (3x → 6x): fractional scaling of pixel type
  // makes uneven strokes.
  const grow = { scale: 3 };
  scene.tweens.add({
    targets: grow,
    scale: 6,
    duration: 1600,
    ease: 'Cubic.easeOut',
    onUpdate: () => {
      const step = Math.round(grow.scale);
      text.setFontSize(6 * step);
      outline.setFontSize(6 * step).setPosition(cx + step, cy + step);
    },
  });
  scene.tweens.add({
    targets: [text, outline, backdrop],
    alpha: 0,
    delay: 1400,
    duration: 700,
    onComplete: () => {
      text.destroy();
      outline.destroy();
      backdrop.destroy();
    },
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

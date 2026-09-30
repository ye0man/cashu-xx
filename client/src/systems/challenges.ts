import type { ChallengeQuestion, ShellRound } from '../data/challenges';
import type { DialogManager } from '../ui/DialogManager';
import type { DialogueChoice } from './dialogue';

export async function runQuestions(dialog: DialogManager, questions: ChallengeQuestion[]): Promise<boolean> {
  for (const question of questions) {
    let passed = false;
    while (!passed) {
      const picked = await dialog.openAsync({
        speaker: question.speaker,
        lines: [question.prompt],
        choices: question.choices,
      });
      if (picked === question.correctChoiceId) {
        passed = true;
      } else {
        await dialog.openAsync({ speaker: question.speaker, lines: [question.retryHint] });
      }
    }
  }
  return true;
}

export async function runShellRounds(dialog: DialogManager, rounds: ShellRound[]): Promise<boolean> {
  const shellChoices: DialogueChoice[] = [
    { id: '1', label: 'Shell 1' },
    { id: '2', label: 'Shell 2' },
    { id: '3', label: 'Shell 3' },
  ];
  for (const round of rounds) {
    let passed = false;
    while (!passed) {
      const picked = await dialog.openAsync({
        speaker: 'COCO',
        lines: [round.prompt],
        choices: shellChoices,
      });
      if (picked === String(round.correctShell)) {
        passed = true;
      } else {
        await dialog.openAsync({ speaker: 'COCO', lines: [round.retryHint] });
      }
    }
  }
  return true;
}

export async function runTraceOrder(
  dialog: DialogManager,
  correctOrder: string[],
): Promise<boolean> {
  const placed: string[] = [];
  for (const expected of correctOrder) {
    let passed = false;
    while (!passed) {
      const remaining = correctOrder.filter((event) => !placed.includes(event));
      const choices: DialogueChoice[] = remaining.map((event) => ({ id: event, label: event }));
      const prompt = placed.length === 0
        ? 'Order the life of a proof. Which happens FIRST?'
        : `Good. Next in the chain? (${placed.length + 1}/${correctOrder.length})`;
      const picked = await dialog.openAsync({
        speaker: 'PIP',
        lines: [prompt],
        choices,
      });
      if (picked === expected) {
        placed.push(expected);
        passed = true;
      } else {
        await dialog.openAsync({
          speaker: 'PIP',
          lines: ['Wrong link in the chain. Think: quote, pay, mint... then the rest.'],
        });
      }
    }
  }
  await dialog.openAsync({
    speaker: 'PIP',
    lines: [`Yes. ${correctOrder.join(' → ')}. Pin that above the desk.`],
  });
  return true;
}

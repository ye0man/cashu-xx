import { describe, expect, it } from 'vitest';
import {
  BLIND_SIGNATURE_QUESTIONS,
  DISCLOSURE_SCENARIOS,
  PIP_SCRIPT_QUESTION,
  RFC_2119_QUESTIONS,
  SHELL_GAME_ROUNDS,
  SWAP_PUZZLE_QUESTIONS,
  TRACE_CORRECT,
  TRACE_ORDER,
  type ChallengeQuestion,
} from '../src/data/challenges';

const allQuestions: ChallengeQuestion[] = [
  ...RFC_2119_QUESTIONS,
  ...SWAP_PUZZLE_QUESTIONS,
  ...BLIND_SIGNATURE_QUESTIONS,
  PIP_SCRIPT_QUESTION,
  ...DISCLOSURE_SCENARIOS,
];

describe('challenge data', () => {
  it('every question has a valid unique correct answer', () => {
    for (const question of allQuestions) {
      const ids = question.choices.map((choice) => choice.id);
      expect(new Set(ids).size, `duplicate choices in: ${question.prompt}`).toBe(ids.length);
      expect(ids, `correct answer missing in: ${question.prompt}`).toContain(question.correctChoiceId);
      expect(question.choices.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('shell rounds use shells 1-3', () => {
    expect(SHELL_GAME_ROUNDS).toHaveLength(3);
    for (const round of SHELL_GAME_ROUNDS) {
      expect([1, 2, 3]).toContain(round.correctShell);
    }
  });

  it('trace order has five steps and matches the taught order', () => {
    expect(TRACE_ORDER).toHaveLength(5);
    expect(TRACE_CORRECT).toEqual(TRACE_ORDER);
  });

  it('the three tests cover the three reviewers plus the RFC opener', () => {
    expect(RFC_2119_QUESTIONS).toHaveLength(3);
    expect(SWAP_PUZZLE_QUESTIONS).toHaveLength(3);
    expect(DISCLOSURE_SCENARIOS).toHaveLength(3);
  });
});

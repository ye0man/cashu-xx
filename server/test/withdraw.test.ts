import type { MilestoneId } from '@cashu-xx/shared';
import { describe, expect, it } from 'vitest';
import { formatPlan, planWithdraw, type BundleTokenInfo, type SendOpInfo } from '../src/admin/withdraw';
import { Repo } from '../src/db/repo';

function bundle(overrides: Partial<BundleTokenInfo> = {}): BundleTokenInfo {
  return {
    sessionId: 'session-1',
    milestoneId: 'impl-rusty' as MilestoneId,
    state: 'locked',
    secrets: ['secret-a', 'secret-b'],
    sats: 10,
    ...overrides,
  };
}

function send(overrides: Partial<SendOpInfo> = {}): SendOpInfo {
  return { id: 'op-1', state: 'pending', amount: 10, secrets: ['secret-a', 'secret-b'], ...overrides };
}

describe('planWithdraw', () => {
  it('matches an in-flight send to its game bundle by proof secrets', () => {
    const plan = planWithdraw([bundle()], [send()]);
    expect(plan.matched).toHaveLength(1);
    expect(plan.matched[0].op.id).toBe('op-1');
    expect(plan.matched[0].bundle.milestoneId).toBe('impl-rusty');
    expect(plan.orphanSends).toHaveLength(0);
    expect(plan.unsweepable).toHaveLength(0);
    expect(plan.totals.matchedSats).toBe(10);
  });

  it('treats a send with no bundle as an orphan (e.g. a prior withdrawal)', () => {
    const plan = planWithdraw([bundle()], [send({ id: 'prev-withdrawal', secrets: ['other'] })]);
    expect(plan.matched).toHaveLength(0);
    expect(plan.orphanSends.map((op) => op.id)).toEqual(['prev-withdrawal']);
    expect(plan.totals.orphanSats).toBe(10);
  });

  it('never reclaims already-redeemed, reclaimed, or undecodable bundles', () => {
    const plan = planWithdraw(
      [
        bundle({ milestoneId: 'impl-coco' as MilestoneId, state: 'issued' }), // redeemed: no in-flight send
        bundle({ milestoneId: 'impl-pip' as MilestoneId, state: 'reclaimed' }),
        bundle({ milestoneId: 'ceremony' as MilestoneId, secrets: null, sats: 0 }), // mock / foreign
      ],
      [],
    );
    expect(plan.matched).toHaveLength(0);
    expect(plan.unsweepable.map((b) => b.milestoneId).sort()).toEqual(['ceremony', 'impl-coco']);
    expect(plan.totals.alreadyReclaimedSats).toBe(10);
    expect(plan.totals.undecodableBundles).toBe(1);
    expect(plan.totals.redeemedBundles).toBe(1);
    expect(plan.warnings.join(' ')).toContain('not real tokens');
  });

  it('counts locked/issued breakdown and does not double-match one bundle', () => {
    const shared = bundle();
    const plan = planWithdraw([shared], [send({ id: 'op-1' }), send({ id: 'op-2' })]);
    expect(plan.matched).toHaveLength(1);
    expect(plan.orphanSends.map((op) => op.id)).toEqual(['op-2']);
    expect(plan.totals.lockedBundles).toBe(1);
    expect(plan.totals.issuedBundles).toBe(0);
  });

  it('formats a readable dry-run summary', () => {
    const lines = formatPlan(planWithdraw([bundle()], [send()]));
    expect(lines[0]).toContain('1');
    expect(lines.join('\n')).toContain('10 sats');
    expect(lines.join('\n')).toContain('never revealed');
  });
});

describe('Repo.markReclaimed', () => {
  it('flips a bundle to the reclaimed state', () => {
    const repo = new Repo(':memory:');
    repo.createSession({
      id: 's1',
      claim_code: 'NUT-AAAA-BBBB',
      auth_token: 'tok',
      quote_id: null,
      mint_op_id: null,
      invoice: null,
      quote_expires_at: null,
      state: 'created',
      created_at: Date.now(),
    });
    repo.createBundles('s1', [{ milestoneId: 'impl-rusty' as MilestoneId, token: 'cashuBxyz' }]);
    expect(repo.getBundle('s1', 'impl-rusty' as MilestoneId)?.state).toBe('locked');
    repo.markReclaimed('s1', 'impl-rusty' as MilestoneId);
    expect(repo.getBundle('s1', 'impl-rusty' as MilestoneId)?.state).toBe('reclaimed');
    repo.close();
  });
});

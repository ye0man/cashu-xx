import { ENTRY_AMOUNT_SATS, MILESTONE_IDS, TOKEN_AMOUNT_SATS } from '@cashu-xx/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { Repo } from '../src/db/repo';
import { MockWallet } from '../src/wallet/MockWallet';
import { WalletError } from '../src/wallet/WalletService';

async function mintedSession(wallet: MockWallet) {
  const session = await wallet.createSession();
  await wallet.getDepositQuote(session.sessionId);
  await wallet.getDepositStatus(session.sessionId);
  return session;
}

describe('MockWallet', () => {
  let repo: Repo;
  let wallet: MockWallet;

  beforeEach(() => {
    repo = new Repo(':memory:');
    wallet = new MockWallet(repo);
  });

  it('covers exactly ten milestone ids worth 100 sats', () => {
    expect(MILESTONE_IDS).toHaveLength(10);
    expect(new Set(MILESTONE_IDS).size).toBe(10);
    expect(TOKEN_AMOUNT_SATS * MILESTONE_IDS.length).toBe(ENTRY_AMOUNT_SATS);
  });

  it('runs the full pay → play → payout loop', async () => {
    const session = await wallet.createSession();
    expect(session.claimCode).toMatch(/^NUT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const quote = await wallet.getDepositQuote(session.sessionId);
    expect(quote.amountSats).toBe(ENTRY_AMOUNT_SATS);
    expect(quote.invoice.length).toBeGreaterThan(0);

    const status = await wallet.getDepositStatus(session.sessionId);
    expect(status).toMatchObject({ paid: true, minted: true, bundlesReady: true });

    const first = await wallet.unlockToken(session.sessionId, 'impl-rusty');
    const again = await wallet.unlockToken(session.sessionId, 'impl-rusty');
    expect(again.unlockedAt).toBe(first.unlockedAt);
    await wallet.unlockToken(session.sessionId, 'kimi-test');

    const ledger = await wallet.getLedger(session.sessionId);
    expect(ledger).toHaveLength(10);
    expect(ledger.find((row) => row.milestoneId === 'impl-rusty')?.state).toBe('unlocked');

    const preview = await wallet.payoutPreview(session.sessionId);
    expect(preview).toMatchObject({ state: 'open', earnedCount: 2, earnedSats: 20 });

    const payout = await wallet.payoutToken(session.sessionId);
    expect(payout).toMatchObject({ amountSats: 20, milestoneCount: 2 });
    expect(payout.token.startsWith('cashuB')).toBe(true);

    // Idempotent: the same token comes back, nothing is paid twice.
    const repeat = await wallet.payoutToken(session.sessionId);
    expect(repeat.token).toBe(payout.token);
    expect(await wallet.payoutPreview(session.sessionId)).toMatchObject({ state: 'token', token: payout.token, paidSats: 20 });

    const recovered = await wallet.recoverSession(session.claimCode);
    expect(recovered.sessionId).toBe(session.sessionId);
    expect(recovered.ledger.filter((row) => row.state === 'claimed')).toHaveLength(2);
  });

  it('pays only earned milestones, never the unearned rest of the entry', async () => {
    const session = await mintedSession(wallet);
    await wallet.unlockToken(session.sessionId, 'ceremony');
    const payout = await wallet.payoutToken(session.sessionId);
    expect(payout.amountSats).toBe(TOKEN_AMOUNT_SATS);
  });

  it('refuses a payout with nothing earned, and unlocks before the deposit', async () => {
    const unpaid = await wallet.createSession();
    await expect(wallet.unlockToken(unpaid.sessionId, 'ceremony')).rejects.toBeInstanceOf(WalletError);

    const session = await mintedSession(wallet);
    await expect(wallet.payoutToken(session.sessionId)).rejects.toMatchObject({ code: 'not_ready' });
  });

  it('melts instead of a token: the unredeemed token is folded back in', async () => {
    const session = await mintedSession(wallet);
    await wallet.unlockToken(session.sessionId, 'impl-coco');
    await wallet.unlockToken(session.sessionId, 'impl-pip');
    await wallet.payoutToken(session.sessionId);

    const melt = await wallet.meltSession(session.sessionId, { destination: 'player@wallet.example' });
    expect(melt).toMatchObject({ state: 'melted', paid: true, amountSats: 20 });
    expect(await wallet.payoutPreview(session.sessionId)).toMatchObject({ state: 'melted', paidSats: 20 });

    // Once melted, neither payout can run again.
    await expect(wallet.payoutToken(session.sessionId)).rejects.toMatchObject({ code: 'reclaimed' });
    await expect(wallet.meltSession(session.sessionId, { destination: 'player@wallet.example' })).rejects.toMatchObject(
      { code: 'reclaimed' },
    );
  });

  it('shares one in-flight payout between double-clicks', async () => {
    const session = await mintedSession(wallet);
    await wallet.unlockToken(session.sessionId, 'impl-coco');
    const [first, second] = await Promise.all([
      wallet.payoutToken(session.sessionId),
      wallet.payoutToken(session.sessionId),
    ]);
    expect(first).toBe(second);
  });

  it('refuses pre-ledger sessions and swept milestones', async () => {
    const session = await mintedSession(wallet);
    repo.markReclaimed(session.sessionId, 'impl-rusty');
    await expect(wallet.unlockToken(session.sessionId, 'impl-rusty')).rejects.toMatchObject({ code: 'reclaimed' });

    repo.setBundleToken(session.sessionId, 'hidden-pos', 'cashuAlegacy');
    await wallet.unlockToken(session.sessionId, 'hidden-pos');
    expect((await wallet.payoutPreview(session.sessionId)).state).toBe('legacy');
    await expect(wallet.payoutToken(session.sessionId)).rejects.toMatchObject({ code: 'reclaimed' });
  });

  it('rejects unknown sessions and claim codes', async () => {
    await expect(wallet.getLedger('nope')).rejects.toMatchObject({ code: 'not_found' });
    await expect(wallet.recoverSession('NUT-AAAA-BBBB')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('authenticates with the session token only', async () => {
    const session = await wallet.createSession();
    expect(await wallet.authenticate(session.sessionId, session.authToken)).toBe(true);
    expect(await wallet.authenticate(session.sessionId, 'wrong')).toBe(false);
    expect(await wallet.authenticate('nope', session.authToken)).toBe(false);
  });
});

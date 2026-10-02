import { ENTRY_AMOUNT_SATS, MILESTONE_IDS, TOKEN_AMOUNT_SATS } from '@cashu-xx/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { Repo } from '../src/db/repo';
import { MockWallet } from '../src/wallet/MockWallet';
import { WalletError } from '../src/wallet/WalletService';

describe('MockWallet', () => {
  let wallet: MockWallet;

  beforeEach(() => {
    wallet = new MockWallet(new Repo(':memory:'));
  });

  it('covers exactly ten milestone ids worth 100 sats', () => {
    expect(MILESTONE_IDS).toHaveLength(10);
    expect(new Set(MILESTONE_IDS).size).toBe(10);
    expect(TOKEN_AMOUNT_SATS * MILESTONE_IDS.length).toBe(ENTRY_AMOUNT_SATS);
  });

  it('runs the full pay → play → claim loop', async () => {
    const session = await wallet.createSession();
    expect(session.claimCode).toMatch(/^NUT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const quote = await wallet.getDepositQuote(session.sessionId);
    expect(quote.amountSats).toBe(ENTRY_AMOUNT_SATS);
    expect(quote.invoice.length).toBeGreaterThan(0);

    const status = await wallet.getDepositStatus(session.sessionId);
    expect(status.paid).toBe(true);
    expect(status.minted).toBe(true);
    expect(status.bundlesReady).toBe(true);

    const first = await wallet.unlockToken(session.sessionId, 'impl-rusty');
    expect(first.token.startsWith('cashuA')).toBe(true);

    const again = await wallet.unlockToken(session.sessionId, 'impl-rusty');
    expect(again.token).toBe(first.token);

    const ledger = await wallet.getLedger(session.sessionId);
    expect(ledger).toHaveLength(10);
    const rustys = ledger.find((row) => row.milestoneId === 'impl-rusty');
    expect(rustys?.state).toBe('issued');
    expect(rustys?.issuedAt).toBe(first.issuedAt);

    const recovered = await wallet.recoverSession(session.claimCode);
    expect(recovered.sessionId).toBe(session.sessionId);
    expect(recovered.ledger).toHaveLength(10);
  });

  it('rejects unlock before the deposit is minted', async () => {
    const session = await wallet.createSession();
    await expect(wallet.unlockToken(session.sessionId, 'ceremony')).rejects.toBeInstanceOf(WalletError);
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

  it('refuses to reveal a token the operator has withdrawn', async () => {
    const repo = new Repo(':memory:');
    const owned = new MockWallet(repo);
    const session = await owned.createSession();
    await owned.getDepositQuote(session.sessionId);
    await owned.getDepositStatus(session.sessionId);
    repo.markReclaimed(session.sessionId, 'impl-rusty');
    await expect(owned.unlockToken(session.sessionId, 'impl-rusty')).rejects.toMatchObject({
      code: 'reclaimed',
    });
  });

  it('reveals pre-stored tokens exactly once per milestone', async () => {
    const session = await wallet.createSession();
    await wallet.getDepositQuote(session.sessionId);
    await wallet.getDepositStatus(session.sessionId);
    const first = await wallet.unlockToken(session.sessionId, 'hidden-tower');
    const second = await wallet.unlockToken(session.sessionId, 'hidden-tower');
    expect(first.token).toBe(second.token);
    expect(first.issuedAt).toBe(second.issuedAt);
    const ledger = await wallet.getLedger(session.sessionId);
    const row = ledger.find((entry) => entry.milestoneId === 'hidden-tower');
    expect(row?.state).toBe('issued');
    expect(row?.issuedAt).toBe(first.issuedAt);
  });

  it('combines unlocked tokens into one token and blocks re-unlocking them', async () => {
    const session = await wallet.createSession();
    await wallet.getDepositQuote(session.sessionId);
    await wallet.getDepositStatus(session.sessionId);

    const result = await wallet.combineTokens(session.sessionId, ['impl-rusty', 'kimi-test']);
    expect(result.combinedCount).toBe(2);
    expect(result.amountSats).toBe(20);
    expect(result.skippedRedeemed).toBe(0);
    expect(result.token.startsWith('cashuA')).toBe(true);

    const ledger = await wallet.getLedger(session.sessionId);
    expect(ledger.find((row) => row.milestoneId === 'impl-rusty')?.state).toBe('combined');
    expect(ledger.find((row) => row.milestoneId === 'kimi-test')?.state).toBe('combined');

    await expect(wallet.unlockToken(session.sessionId, 'impl-rusty')).rejects.toMatchObject({
      code: 'combined',
    });
    const untouched = await wallet.unlockToken(session.sessionId, 'hidden-pos');
    expect(untouched.token.startsWith('cashuA')).toBe(true);
  });

  it('rejects combine before the deposit and with nothing combinable', async () => {
    const session = await wallet.createSession();
    await expect(wallet.combineTokens(session.sessionId, ['ceremony'])).rejects.toMatchObject({
      code: 'not_ready',
    });

    await wallet.getDepositQuote(session.sessionId);
    await wallet.getDepositStatus(session.sessionId);
    const again = await wallet.combineTokens(session.sessionId, ['impl-rusty']);
    expect(again.combinedCount).toBe(1);
    await expect(wallet.combineTokens(session.sessionId, ['impl-rusty'])).rejects.toMatchObject({
      code: 'not_ready',
    });
  });

  it('recovers bundles stranded in the combining state', async () => {
    const repo = new Repo(':memory:');
    const owned = new MockWallet(repo);
    const session = await owned.createSession();
    await owned.getDepositQuote(session.sessionId);
    await owned.getDepositStatus(session.sessionId);

    // Simulate a combine that reclaimed this token but crashed before issuing.
    repo.setBundleState(session.sessionId, 'impl-rusty', 'combining');
    await expect(owned.unlockToken(session.sessionId, 'impl-rusty')).rejects.toMatchObject({
      code: 'not_ready',
    });

    // Retrying for a *different* milestone still sweeps the stranded one in.
    const result = await owned.combineTokens(session.sessionId, ['kimi-test']);
    expect(result.combinedCount).toBe(2);
    const ledger = await owned.getLedger(session.sessionId);
    expect(ledger.find((row) => row.milestoneId === 'impl-rusty')?.state).toBe('combined');
    expect(ledger.find((row) => row.milestoneId === 'kimi-test')?.state).toBe('combined');
  });
});

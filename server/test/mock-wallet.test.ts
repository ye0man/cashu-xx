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
});

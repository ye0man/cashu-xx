import type {
  ClaimResponse,
  CreateSessionResponse,
  DepositQuote,
  DepositStatus,
  LedgerResponse,
  MilestoneId,
  MintInfoResponse,
  UnlockResponse,
} from '@cashu-xx/shared';
import { getGameSession } from './session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = new Headers();
  if (method === 'POST') {
    headers.set('content-type', 'application/json');
  }
  if (options.auth) {
    const session = getGameSession();
    if (session) {
      headers.set('authorization', `Bearer ${session.authToken}`);
    }
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
    });
  } catch {
    // the game server itself is down (not the mint)
    throw new ApiError(0, 'game server not reachable — is `npm run dev:real` running?');
  }
  if (!res.ok) {
    let reason = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body?.error === 'string') {
        reason = body.error;
      }
    } catch {
      // non-JSON body (e.g. the Vite proxy's own error page)
      if (res.status === 500 || res.status === 502 || res.status === 504) {
        reason = 'game server not reachable — is `npm run dev:real` running?';
      }
    }
    throw new ApiError(res.status, reason);
  }
  return (await res.json()) as T;
}

export const api = {
  createSession: () => request<CreateSessionResponse>('/api/session', { method: 'POST' }),
  deposit: (sessionId: string) => request<DepositQuote>(`/api/session/${sessionId}/deposit`, { auth: true }),
  depositStatus: (sessionId: string) =>
    request<DepositStatus>(`/api/session/${sessionId}/deposit/status`, { auth: true }),
  unlock: (sessionId: string, milestoneId: MilestoneId) =>
    request<UnlockResponse>(`/api/session/${sessionId}/unlock`, {
      method: 'POST',
      body: { milestoneId },
      auth: true,
    }),
  ledger: (sessionId: string) => request<LedgerResponse>(`/api/session/${sessionId}/ledger`, { auth: true }),
  claim: (claimCode: string) =>
    request<ClaimResponse>('/api/session/claim', { method: 'POST', body: { claimCode } }),
  mintInfo: () => request<MintInfoResponse>('/api/mint'),
};

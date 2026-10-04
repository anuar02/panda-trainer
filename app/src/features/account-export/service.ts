import { librarySessionId } from '@/features/workspace-library/read-session';
import {
  type AccountExport,
  AccountExportValidationError,
  isExportUuid,
  parseAccountExport,
} from '@/domain/account-export';

export type ExportSession = { user: { id: string }; access_token: string };
type ExportResponse = PromiseLike<{
  data: unknown;
  error: { code?: string } | null;
  status: number;
}>;
type ExportRequest = ExportResponse & {
  abortSignal?(signal: AbortSignal): ExportResponse;
  setHeader?(name: string, value: string): ExportRequest;
};
export type AccountExportTransport = {
  auth: {
    getSession(): Promise<{
      data: { session: ExportSession | null };
      error: unknown;
    }>;
  };
  rpc(
    name: 'export_trainer_workspace',
    args: { p_workspace_id: string },
  ): ExportRequest;
};
export type AccountExportErrorCode =
  | 'invalidInput'
  | 'unauthenticated'
  | 'forbidden'
  | 'network'
  | 'request'
  | 'sessionChanged'
  | 'unsupportedVersion'
  | 'malformedPayload'
  | 'tenantMismatch'
  | 'stale'
  | 'localRead';
export class AccountExportError extends Error {
  constructor(
    readonly code: AccountExportErrorCode,
    readonly timedOut = false,
  ) {
    super(code);
    this.name = 'AccountExportError';
  }
}
export function exportSessionIdentity(session: ExportSession | null): {
  userId: string;
  sessionId: string;
  token: string;
} {
  if (!session?.access_token) throw new AccountExportError('unauthenticated');
  const sessionId = librarySessionId(session);
  if (!sessionId || !isExportUuid(session.user.id))
    throw new AccountExportError('sessionChanged');
  return { userId: session.user.id, sessionId, token: session.access_token };
}
export async function boundedExportStep<T>(
  operation: PromiseLike<T>,
  signal?: AbortSignal,
  timeoutMs = 30000,
  timeoutCode: AccountExportErrorCode = 'network',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_resolve, reject) => {
        rejectAbort = () => reject(new AccountExportError('sessionChanged'));
        if (signal?.aborted) {
          rejectAbort();
          return;
        }
        signal?.addEventListener('abort', rejectAbort, { once: true });
        timer = setTimeout(
          () => reject(new AccountExportError(timeoutCode, true)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (rejectAbort) signal?.removeEventListener('abort', rejectAbort);
  }
}
export async function loadAccountExport(
  transport: AccountExportTransport,
  input: {
    expectedUserId: string;
    workspaceId: string;
    expectedToken?: string;
    expectedSessionId?: string;
    signal?: AbortSignal;
  },
): Promise<AccountExport> {
  input = Object.freeze({ ...input });
  if (!isExportUuid(input.expectedUserId) || !isExportUuid(input.workspaceId))
    throw new AccountExportError('invalidInput');
  try {
    const before = await boundedExportStep(
      transport.auth.getSession(),
      input.signal,
    );
    if (before.error) throw new AccountExportError('network');
    const identity = exportSessionIdentity(before.data.session);
    if (
      identity.userId !== input.expectedUserId ||
      (input.expectedToken !== undefined &&
        identity.token !== input.expectedToken) ||
      (input.expectedSessionId !== undefined &&
        identity.sessionId !== input.expectedSessionId)
    )
      throw new AccountExportError('sessionChanged');
    if (input.signal?.aborted) throw new AccountExportError('sessionChanged');
    const outcome = await (async () => {
      try {
        const request = transport.rpc('export_trainer_workspace', {
          p_workspace_id: input.workspaceId,
        });
        if (!request.setHeader) throw new AccountExportError('request');
        const authenticated = request.setHeader(
          'Authorization',
          `Bearer ${identity.token}`,
        );
        const response = await boundedExportStep(
          input.signal && authenticated.abortSignal
            ? authenticated.abortSignal(input.signal)
            : authenticated,
          input.signal,
        );
        return { failed: false as const, response };
      } catch (error: unknown) {
        if (
          input.signal?.aborted ||
          (error instanceof AccountExportError && error.timedOut)
        )
          throw error;
        return { failed: true as const, error };
      }
    })();
    const after = await boundedExportStep(
      transport.auth.getSession(),
      input.signal,
      5000,
    );
    if (after.error) throw new AccountExportError('network');
    if (!after.data.session) throw new AccountExportError('sessionChanged');
    const current = exportSessionIdentity(after.data.session);
    if (
      current.userId !== identity.userId ||
      current.token !== identity.token ||
      current.sessionId !== identity.sessionId
    )
      throw new AccountExportError('sessionChanged');
    if (outcome.failed) {
      if (outcome.error instanceof AccountExportError) throw outcome.error;
      throw new AccountExportError('network');
    }
    const response = outcome.response;
    if (response.error || response.status < 200 || response.status >= 300) {
      if (response.error?.code === '42501' || response.status === 403)
        throw new AccountExportError('forbidden');
      if (response.status === 401)
        throw new AccountExportError('unauthenticated');
      if (response.status === 0 || response.status >= 500)
        throw new AccountExportError('network');
      throw new AccountExportError('request');
    }
    return parseAccountExport(response.data, {
      workspaceId: input.workspaceId,
      ownerUserId: input.expectedUserId,
    });
  } catch (error: unknown) {
    if (error instanceof AccountExportError) throw error;
    if (error instanceof AccountExportValidationError)
      throw new AccountExportError(error.code);
    throw new AccountExportError('network');
  }
}

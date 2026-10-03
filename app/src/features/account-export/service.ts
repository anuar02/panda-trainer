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
  ): ExportResponse & { abortSignal?(signal: AbortSignal): ExportResponse };
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
  | 'tenantMismatch';
export class AccountExportError extends Error {
  constructor(readonly code: AccountExportErrorCode) {
    super(code);
    this.name = 'AccountExportError';
  }
}
export async function loadAccountExport(
  transport: AccountExportTransport,
  input: { expectedUserId: string; workspaceId: string; signal?: AbortSignal },
): Promise<AccountExport> {
  if (!isExportUuid(input.expectedUserId) || !isExportUuid(input.workspaceId))
    throw new AccountExportError('invalidInput');
  try {
    const before = await transport.auth.getSession();
    if (before.error) throw new AccountExportError('network');
    const session = before.data.session;
    if (!session?.access_token) throw new AccountExportError('unauthenticated');
    if (session.user.id !== input.expectedUserId)
      throw new AccountExportError('sessionChanged');
    const userId = session.user.id;
    const accessToken = session.access_token;
    if (input.signal?.aborted) throw new AccountExportError('sessionChanged');
    const request = transport.rpc('export_trainer_workspace', {
      p_workspace_id: input.workspaceId,
    });
    const response = await (input.signal && request.abortSignal
      ? request.abortSignal(input.signal)
      : request);
    if (input.signal?.aborted) throw new AccountExportError('sessionChanged');
    const after = await transport.auth.getSession();
    if (after.error) throw new AccountExportError('network');
    if (
      after.data.session?.user.id !== userId ||
      after.data.session.access_token !== accessToken
    )
      throw new AccountExportError('sessionChanged');
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

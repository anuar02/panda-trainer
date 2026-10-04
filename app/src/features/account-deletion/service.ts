import { getSupabaseClient } from '@/features/auth/client';
import { boundedExportStep } from '@/features/account-export/service';

export type DeletionInspection = {
  user_id: string;
  workspace_ids: string[];
  foreign_client_card_count: number;
  has_trainer_workspace: boolean;
  has_client_cards: boolean;
};
export type DeletionIdentity = {
  accountId: string;
  token: string;
  sessionId?: string;
};
export type DeletionRequest = { requestId: string; recoveryToken: string };
export type DeletionStatus = 'prepared' | 'database_deleted' | 'complete';
export type DeletionTransport = (
  body: Record<string, unknown>,
  bearer?: string,
) => Promise<{ status: number; data: unknown }>;
export const deletionTransport: DeletionTransport = async (body, bearer) => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('configuration');
  const response = await boundedExportStep(
    fetch(`${url}/functions/v1/account-deletion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  return {
    status: response.status,
    data: (await boundedExportStep(response.json())) as unknown,
  };
};
export async function inspectDeletion(
  identity: DeletionIdentity,
  transport = deletionTransport,
): Promise<DeletionInspection> {
  const result = await transport({ action: 'inspect' }, identity.token);
  const value = result.data as Partial<DeletionInspection> | null;
  if (
    result.status !== 200 ||
    !value ||
    value.user_id !== identity.accountId ||
    !Array.isArray(value.workspace_ids) ||
    !value.workspace_ids.every((id) => typeof id === 'string') ||
    !Number.isSafeInteger(value.foreign_client_card_count) ||
    (value.foreign_client_card_count ?? -1) < 0 ||
    typeof value.has_trainer_workspace !== 'boolean' ||
    typeof value.has_client_cards !== 'boolean'
  )
    throw new Error('inspection_unknown');
  return value as DeletionInspection;
}
export async function sendDeletion(
  action: 'delete' | 'status',
  request: DeletionRequest,
  bearer?: string,
  transport = deletionTransport,
): Promise<DeletionStatus> {
  const result = await transport(
    {
      action,
      requestId: request.requestId,
      recoveryToken: request.recoveryToken,
    },
    bearer,
  );
  const value = result.data as { requestId?: unknown; status?: unknown } | null;
  if (
    result.status !== 200 ||
    !value ||
    value.requestId !== request.requestId ||
    !['prepared', 'database_deleted', 'complete'].includes(String(value.status))
  )
    throw new Error('deletion_unknown');
  return value.status as DeletionStatus;
}
export async function requireDeletionSession(
  identity: DeletionIdentity,
): Promise<void> {
  const session = await boundedExportStep(
    getSupabaseClient()!.auth.getSession(),
  );
  if (
    session.error ||
    session.data.session?.user.id !== identity.accountId ||
    session.data.session.access_token !== identity.token
  )
    throw new Error('session_changed');
}

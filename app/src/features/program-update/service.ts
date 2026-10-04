import type { SyncSession } from '@/domain/workout-sync/types';
import {
  record,
  uuid,
  validateCommand,
  validateContext,
  type UpdateCommand,
  type UpdateReceipt,
} from '@/domain/program-update';
import { openProgramUpdateSession, type ProgramUpdateSession } from './session';
export function createProgramUpdateTransport(options: {
  session: SyncSession;
  getSession(): SyncSession | null;
  workoutId: string;
  clientRecordId: string;
  url: string;
  anonKey: string;
  fetch?: typeof fetch;
  fence?: ProgramUpdateSession;
  onInvalidated?: () => void;
}) {
  const session = { ...options.session };
  const getSession = options.getSession;
  const url = options.url;
  const anonKey = options.anonKey;
  const ownedFence = !options.fence;
  const scope = {
    account_id: session.accountId,
    workspace_id: session.workspaceId,
    workout_id: options.workoutId,
    client_record_id: options.clientRecordId,
  };
  if (
    ![...Object.values(scope), session.sessionId].every(uuid) ||
    !options.url ||
    !options.anonKey
  )
    throw new Error('update_invalid');
  const fence =
    options.fence ??
    openProgramUpdateSession(
      session.accountId,
      session.sessionId,
      options.onInvalidated,
    );
  const fetcher = options.fetch ?? fetch;
  let disposed = false;
  const valid = () => {
    const now = getSession();
    return (
      !disposed &&
      fence.valid() &&
      now?.accountId === session.accountId &&
      now.workspaceId === session.workspaceId &&
      now.sessionId === session.sessionId
    );
  };
  const assert = () => {
    if (!valid()) throw new Error('update_session');
  };
  const matches = (v: Record<string, unknown>) =>
    Object.entries(scope).every(([k, x]) => v[k] === x);
  async function rpc(name: string, args: Record<string, unknown>) {
    try {
      assert();
      const token = await fence.token(session.accountId);
      assert();
      const response = await fetcher(
        `${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`,
        {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_actor_id: scope.account_id,
            p_workspace_id: scope.workspace_id,
            p_workout_id: scope.workout_id,
            p_client_record_id: scope.client_record_id,
            ...args,
          }),
        },
      );
      const result: unknown = await response.json();
      await fence.token(session.accountId);
      assert();
      if (!response.ok)
        throw new Error(
          record(result) && result.code === '40001'
            ? 'update_conflict'
            : record(result) &&
                ['22023', '23514', '23505'].includes(String(result.code))
              ? 'update_invalid'
              : record(result) &&
                  ['P0002', '42501'].includes(String(result.code))
                ? 'update_unavailable'
                : 'update_unknown',
        );
      if (!record(result) || !matches(result))
        throw new Error('update_response');
      return result;
    } catch (error) {
      await fence.token(session.accountId);
      assert();
      throw error;
    }
  }
  return {
    valid,
    dispose: () => {
      disposed = true;
      if (ownedFence) fence.dispose();
    },
    async load() {
      return validateContext(await rpc('get_program_update', {}));
    },
    async apply(input: UpdateCommand): Promise<UpdateReceipt> {
      const command = validateCommand(input);
      const v = await rpc('update_client_program', {
        p_program_id: command.programId,
        p_expected_program_revision: command.expectedProgramRevision,
        p_expected_workout_revision: command.expectedWorkoutRevision,
        p_selected_keys: command.selectedKeys,
        p_request_id: command.requestId,
      });
      if (
        !uuid(v.program_id) ||
        v.program_id === command.programId ||
        v.request_id !== command.requestId ||
        v.revision !== 1 ||
        v.status !== 'applied'
      )
        throw new Error('update_response');
      return {
        ...scope,
        program_id: v.program_id,
        request_id: command.requestId,
        revision: 1,
        status: 'applied',
      };
    },
  };
}
export type ProgramUpdateTransport = ReturnType<
  typeof createProgramUpdateTransport
>;

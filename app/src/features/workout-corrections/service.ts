import type { SyncSession } from '@/domain/workout-sync/types';
import { openCorrectionSession, type CorrectionSession } from './session';
import {
  isRecord as record,
  timestamp,
  validateOperation,
  validateCurrent,
  json,
  immutable,
} from './validation';
import {
  validUuid,
  validRevision,
  validateCommand,
  type CorrectionCommand,
  type CorrectionScope,
  type CorrectionReview,
  type CorrectionReceipt,
} from './types';

export type CorrectionTransportOptions = {
  session: SyncSession;
  getSession: () => SyncSession | null;
  workoutId: string;
  url: string;
  anonKey: string;
  fetch?: typeof fetch;
  fence?: CorrectionSession;
  onInvalidated?: () => void;
};
const matches = (value: Record<string, unknown>, scope: CorrectionScope) =>
  value.account_id === scope.accountId &&
  value.workspace_id === scope.workspaceId &&
  value.workout_id === scope.workoutId;
export function createCorrectionTransport(options: CorrectionTransportOptions) {
  const session = Object.freeze({
    ...options.session,
    accountId: options.session.accountId.toLowerCase(),
    workspaceId: options.session.workspaceId.toLowerCase(),
    sessionId: options.session.sessionId.toLowerCase(),
  });
  const getSession = options.getSession;
  const url = options.url;
  const anonKey = options.anonKey;
  const scope = Object.freeze({
    accountId: session.accountId,
    workspaceId: session.workspaceId,
    workoutId: options.workoutId.toLowerCase(),
  });
  if (
    ![
      scope.accountId,
      scope.workspaceId,
      scope.workoutId,
      session.sessionId,
    ].every(validUuid) ||
    !options.url ||
    !options.anonKey
  )
    throw new Error('correction_invalid');
  const fence =
    options.fence ??
    openCorrectionSession(
      session.accountId,
      session.sessionId,
      options.onInvalidated,
    );
  const request = options.fetch ?? fetch;
  let disposed = false;
  const assertCurrent = () => {
    const current = getSession();
    if (
      disposed ||
      !fence.valid() ||
      !current ||
      current.accountId.toLowerCase() !== session.accountId ||
      current.workspaceId.toLowerCase() !== session.workspaceId ||
      current.sessionId.toLowerCase() !== session.sessionId
    )
      throw new Error('correction_session_changed');
  };
  async function rpc(name: string, args: Record<string, unknown>) {
    try {
      assertCurrent();
      const accessToken = await fence.token(scope.accountId);
      assertCurrent();
      const response = await request(
        `${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`,
        {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_actor_id: scope.accountId,
            p_workspace_id: scope.workspaceId,
            p_workout_id: scope.workoutId,
            ...args,
          }),
        },
      );
      const result: unknown = await response.json();
      await fence.token(scope.accountId);
      assertCurrent();
      if (!response.ok)
        throw new Error(
          record(result) &&
            (result.code === '40001' ||
              (result.code === '22023' && result.message === 'stale_conflict'))
            ? 'correction_conflict'
            : record(result) && result.code === 'P0002'
              ? 'correction_not_found'
              : record(result) && result.code === '22023'
                ? 'correction_stale'
                : record(result) && result.code === '42501'
                  ? 'correction_unavailable'
                  : 'correction_request',
        );
      return result;
    } catch (error) {
      await fence.token(scope.accountId);
      assertCurrent();
      throw new Error(
        error instanceof Error &&
          [
            'correction_conflict',
            'correction_not_found',
            'correction_stale',
            'correction_unavailable',
            'correction_request',
            'correction_session_changed',
          ].includes(error.message)
          ? error.message
          : 'correction_request',
      );
    }
  }
  return {
    scope,
    async verifiedSession() {
      const token = await fence.token(scope.accountId);
      assertCurrent();
      return { ...session, accessToken: token };
    },
    async list(): Promise<CorrectionReview[]> {
      const value = await rpc('list_workout_corrections', {});
      if (
        !record(value) ||
        !matches(value, scope) ||
        !Array.isArray(value.drafts) ||
        value.drafts.length > 100
      )
        throw new Error('correction_response');
      const seen = new Set<string>();
      const ids = value.drafts.map((draft: unknown) => {
        if (
          !record(draft) ||
          !validUuid(draft.id) ||
          seen.has(draft.id) ||
          !timestamp(draft.created_at) ||
          !(draft.applied_at === null || timestamp(draft.applied_at)) ||
          !(
            draft.applied_request_id === null ||
            validUuid(draft.applied_request_id)
          )
        )
          throw new Error('correction_response');
        if (
          record(draft.operation) &&
          ['create_workout', 'finish_workout'].includes(
            String(draft.operation.kind),
          )
        ) {
          if (
            !validUuid(draft.operation.operation_id) ||
            !validUuid(draft.operation.entity_id) ||
            !validUuid(draft.operation.device_id) ||
            !validRevision(draft.operation.base_revision) ||
            !timestamp(draft.operation.created_at) ||
            !record(draft.operation.payload) ||
            Object.keys(draft.operation).sort().join(',') !==
              'base_revision,created_at,device_id,entity_id,kind,operation_id,payload' ||
            draft.operation.entity_id !== scope.workoutId ||
            (draft.operation.kind === 'finish_workout'
              ? Object.keys(draft.operation.payload).length !== 0
              : Object.keys(draft.operation.payload).join(',') !==
                  'booking_id' ||
                !validUuid(draft.operation.payload.booking_id))
          )
            throw new Error('correction_response');
          seen.add(draft.id);
          return null;
        }
        validateOperation(draft.operation, scope);
        seen.add(draft.id);
        return draft.applied_at === null ? draft.id : null;
      });
      const result: CorrectionReview[] = [];
      for (const id of ids) if (id) result.push(await this.review(id));
      assertCurrent();
      return result;
    },
    valid: () => {
      try {
        assertCurrent();
        return true;
      } catch {
        return false;
      }
    },
    dispose: () => {
      disposed = true;
      if (!options.fence) fence.dispose();
    },
    async review(draftId: string): Promise<CorrectionReview> {
      if (!validUuid(draftId)) throw new Error('correction_invalid');
      draftId = draftId.toLowerCase();
      const value = await rpc('get_workout_correction', {
        p_draft_id: draftId,
      });
      if (
        !record(value) ||
        !matches(value, scope) ||
        value.draft_id !== draftId ||
        !validRevision(value.workout_revision) ||
        value.workout_revision < 1 ||
        !validRevision(value.entity_revision) ||
        !(
          value.exercise_revision === null ||
          validRevision(value.exercise_revision)
        ) ||
        !json(value.operation) ||
        !json(value.current_version) ||
        !json(value.conflict)
      )
        throw new Error('correction_response');
      validateOperation(value.operation, scope);
      validateCurrent(value.current_version, scope);
      if (
        !timestamp(value.finished_at) ||
        !(value.applied_at === null || timestamp(value.applied_at)) ||
        !(
          value.applied_request_id === null ||
          validUuid(value.applied_request_id)
        )
      )
        throw new Error('correction_response');
      if (value.conflict !== null) {
        if (
          !record(value.conflict) ||
          value.conflict.workspace_id !== scope.workspaceId ||
          value.conflict.workout_instance_id !== scope.workoutId ||
          !validUuid(value.conflict.id) ||
          !validUuid(value.conflict.entity_id) ||
          !validRevision(value.conflict.expected_revision)
        )
          throw new Error('correction_response');
        const incoming = validateOperation(
          value.conflict.incoming_operation,
          scope,
        );
        if (
          incoming.kind !== value.conflict.kind ||
          incoming.entity_id.toLowerCase() !== value.conflict.entity_id ||
          !record(value.conflict.current_version)
        )
          throw new Error('correction_response');
        const snapshot = value.conflict.current_version;
        validateCurrent(
          {
            entity: snapshot,
            exercise: snapshot.exercise ?? null,
            sets: snapshot.sets ?? [],
            replacements: snapshot.replacements ?? [],
          },
          scope,
        );
      }
      if (
        (value.applied_at === null) !== (value.applied_request_id === null) ||
        (value.applied_at === null) !== (value.receipt === null)
      )
        throw new Error('correction_response');
      if (value.receipt !== null) {
        const receipt = value.receipt;
        if (
          !record(receipt) ||
          !matches(receipt, scope) ||
          receipt.draft_id !== draftId ||
          !validUuid(receipt.request_id) ||
          receipt.request_id !== value.applied_request_id ||
          receipt.status !== 'applied' ||
          !validRevision(receipt.revision) ||
          !validRevision(receipt.entity_revision) ||
          receipt.finished_at !== value.finished_at ||
          !value.applied_at
        )
          throw new Error('correction_response');
      }
      const operation = validateOperation(value.operation, scope);
      if (operation.kind === 'resolve_conflict') {
        if (
          !record(value.conflict) ||
          value.conflict.id !==
            String(operation.payload.conflict_id).toLowerCase() ||
          value.conflict.entity_id !== operation.entity_id.toLowerCase() ||
          value.conflict.expected_revision !==
            operation.payload.expected_revision ||
          ![
            'upsert_set',
            'delete_set',
            'replace_exercise',
            'set_note',
          ].includes(String(value.conflict.kind))
        )
          throw new Error('correction_response');
      } else if (value.conflict !== null)
        throw new Error('correction_response');
      const effective =
        operation.kind === 'resolve_conflict' && record(value.conflict)
          ? validateOperation(value.conflict.incoming_operation, scope)
          : operation;
      const current = validateCurrent(value.current_version, scope);
      const targetId =
        effective.kind === 'replace_exercise'
          ? String(effective.payload.replaced_from_id).toLowerCase()
          : effective.entity_id.toLowerCase();
      if (
        current.entity === null
          ? value.entity_revision !== 0
          : !record(current.entity) ||
            current.entity.id !== targetId ||
            current.entity.revision !== value.entity_revision
      )
        throw new Error('correction_response');
      const exerciseId = ['upsert_set', 'delete_set'].includes(effective.kind)
        ? String(effective.payload.workout_exercise_id).toLowerCase()
        : effective.kind === 'replace_exercise'
          ? String(effective.payload.replaced_from_id).toLowerCase()
          : null;
      if (exerciseId !== null) {
        if (
          !record(current.exercise) ||
          current.exercise.id !== exerciseId ||
          (effective.kind !== 'replace_exercise' &&
            current.exercise.revision !== value.exercise_revision) ||
          !Array.isArray(current.sets) ||
          current.sets.some(
            (set) => !record(set) || set.workout_exercise_id !== exerciseId,
          ) ||
          !Array.isArray(current.replacements) ||
          current.replacements.some(
            (exercise) =>
              !record(exercise) || exercise.replaced_from_id !== exerciseId,
          )
        )
          throw new Error('correction_response');
      }
      return immutable(JSON.parse(JSON.stringify(value)) as CorrectionReview);
    },
    async apply(input: CorrectionCommand): Promise<CorrectionReceipt> {
      const command = validateCommand(input);
      const value = await rpc('apply_workout_correction', {
        p_draft_id: command.draftId,
        p_request_id: command.requestId,
        p_expected_workout_revision: command.expectedWorkoutRevision,
        p_expected_entity_revision: command.expectedEntityRevision,
        p_expected_exercise_revision: command.expectedExerciseRevision,
      });
      if (
        !record(value) ||
        !matches(value, scope) ||
        value.draft_id !== command.draftId ||
        value.request_id !== command.requestId ||
        value.status !== 'applied' ||
        !timestamp(value.finished_at) ||
        !validRevision(value.revision) ||
        value.revision !== command.expectedWorkoutRevision + 1 ||
        !validRevision(value.entity_revision)
      )
        throw new Error('correction_response');
      return {
        account_id: scope.accountId,
        workspace_id: scope.workspaceId,
        workout_id: scope.workoutId,
        draft_id: command.draftId,
        request_id: command.requestId,
        status: 'applied',
        finished_at: value.finished_at,
        revision: value.revision,
        entity_revision: value.entity_revision,
      };
    },
  };
}
export type CorrectionTransport = ReturnType<typeof createCorrectionTransport>;

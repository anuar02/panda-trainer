import { randomUUID } from 'expo-crypto';
import type { UpdateCommand, UpdateContext } from '@/domain/program-update';
import type { ProgramUpdateTransport } from './service';
import {
  loadPendingUpdateCommand,
  savePendingUpdateCommand,
  clearPendingUpdateCommand,
  PendingUpdateCommandError,
} from './pending';
export type UpdateState = {
  context: UpdateContext | null;
  pending: UpdateCommand | null;
  selected: string[];
  busy: boolean;
  error: string | null;
  applied: boolean;
  ready: boolean;
};
export function createUpdateController(options: {
  transport: ProgramUpdateTransport;
  actorId: string;
  workspaceId: string;
  workoutId: string;
  clientRecordId: string;
  current(): boolean;
  changed(state: UpdateState): void;
  refresh?(context: UpdateContext): Promise<void>;
}) {
  const {
    transport,
    actorId,
    workspaceId,
    workoutId,
    clientRecordId,
    current,
  } = options;
  let state: UpdateState = {
    context: null,
    pending: null,
    selected: [],
    busy: false,
    error: null,
    applied: false,
    ready: false,
  };
  let locked = false;
  const publish = (next: Partial<UpdateState>) => {
    if (!current()) return;
    state = { ...state, ...next };
    options.changed({ ...state, selected: [...state.selected] });
  };
  const clear = (requestId: string) =>
    clearPendingUpdateCommand(
      actorId,
      workspaceId,
      workoutId,
      clientRecordId,
      requestId,
      current,
    );
  const failure = (e: unknown) =>
    e instanceof Error &&
    ['update_conflict', 'update_invalid', 'update_unavailable'].includes(
      e.message,
    )
      ? e.message
      : 'update_unknown';
  return {
    async load() {
      if (locked || !current()) return;
      locked = true;
      publish({ busy: true, error: null, ready: false });
      try {
        const pending = await loadPendingUpdateCommand(
          actorId,
          workspaceId,
          workoutId,
          clientRecordId,
          current,
        );
        if (!current()) return;
        publish({ pending, selected: pending?.selectedKeys ?? [] });
        const context = await transport.load();
        if (!current()) return;
        publish({
          context,
          selected:
            pending?.selectedKeys ??
            context.options.filter((o) => o.checked).map((o) => o.key),
          ready: true,
        });
      } catch (e) {
        publish({
          error: state.pending
            ? 'update_unknown'
            : failure(e) === 'update_unknown'
              ? 'update_read_error'
              : failure(e),
          ready: state.pending !== null,
        });
      } finally {
        locked = false;
        publish({ busy: false });
      }
    },
    toggle(key: string) {
      if (
        locked ||
        !current() ||
        !state.ready ||
        state.pending ||
        !state.context?.options.some((o) => o.key === key)
      )
        return;
      const selected = state.selected.includes(key)
        ? state.selected.filter((x) => x !== key)
        : [...state.selected, key];
      const id = key.split(':')[1];
      publish({
        selected:
          key.startsWith('skip:') && selected.includes(key)
            ? selected.filter((x) => x === key || x.split(':')[1] !== id)
            : selected.filter(
                (x) => !x.startsWith('skip:') || x.split(':')[1] !== id,
              ),
      });
    },
    async confirm() {
      if (
        locked ||
        !current() ||
        !state.ready ||
        (!state.pending && (!state.context || state.selected.length === 0))
      )
        return;
      locked = true;
      publish({ busy: true, error: null });
      const command = state.pending ?? {
        programId: state.context!.program_id,
        requestId: randomUUID(),
        expectedProgramRevision: state.context!.program_revision,
        expectedWorkoutRevision: state.context!.workout_revision,
        selectedKeys: [...state.selected],
      };
      let confirmed = false;
      try {
        await savePendingUpdateCommand(
          actorId,
          workspaceId,
          workoutId,
          clientRecordId,
          command,
          current,
        );
        if (!current()) return;
        publish({ pending: command });
        const receipt = await transport.apply(command);
        confirmed = true;
        if (!current()) return;
        const context = await transport.load();
        if (!current()) return;
        if (
          context.program_id !== receipt.program_id ||
          context.program_revision !== receipt.revision
        )
          throw new Error('update_readback');
        await options.refresh?.(context);
        if (!current()) return;
        if (!(await clear(command.requestId)))
          throw new Error('update_storage');
        publish({
          pending: null,
          context,
          selected: [],
          applied: true,
          error: null,
        });
      } catch (e) {
        if (
          e instanceof PendingUpdateCommandError &&
          e.code === 'unresolved' &&
          current()
        ) {
          try {
            const pending = await loadPendingUpdateCommand(
              actorId,
              workspaceId,
              workoutId,
              clientRecordId,
              current,
            );
            if (pending) publish({ pending, selected: pending.selectedKeys });
          } catch {
            publish({ ready: false });
          }
        }
        publish({ error: confirmed ? 'update_unknown' : failure(e) });
      } finally {
        locked = false;
        publish({ busy: false });
      }
    },
    async reject() {
      if (
        locked ||
        !current() ||
        !state.pending ||
        !['update_conflict', 'update_invalid', 'update_unavailable'].includes(
          state.error ?? '',
        )
      )
        return;
      locked = true;
      try {
        if (await clear(state.pending.requestId))
          publish({
            pending: null,
            ready: false,
            context: null,
            selected: [],
            error: null,
          });
      } catch {
        publish({ error: 'update_unknown' });
      } finally {
        locked = false;
      }
    },
  };
}

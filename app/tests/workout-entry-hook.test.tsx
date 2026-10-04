import { randomUUID } from 'expo-crypto';
import { openWorkoutPreloadStore } from '../src/features/workout-preload/storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type {
  PreloadParticipant,
  WorkoutPreloadContext,
} from '../src/domain/workout-preload/types';
import type { SyncSession } from '../src/domain/workout-sync/types';
import type { EntryRead } from '../src/features/workout-entry/service';
import { WorkoutEntryService } from '../src/features/workout-entry/service';
import { useWorkoutEntry } from '../src/features/workout-entry/use-entry';
import { openEntryDraftStore } from '../src/features/workout-entry/storage';
import { loadEntryResources } from '../src/features/workout-entry/resources';
import {
  openOutboxStore,
  createOutboxRunner,
} from '../src/features/workout-sync';
import { createWorkoutPreloadReader } from '../src/features/workout-preload/service';
import { deferred, memoryStore, session } from './workout-sync-fixtures';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../src/features/workout-preload/storage', () => ({
  openWorkoutPreloadStore: jest.fn(),
}));
jest.mock('../src/features/workout-entry/service', () => ({
  WorkoutEntryService: jest.fn(),
}));
jest.mock('../src/features/workout-entry/storage', () => ({
  openEntryDraftStore: jest.fn(),
}));
jest.mock('../src/features/workout-entry/resources', () => ({
  loadEntryResources: jest.fn(),
}));
jest.mock('../src/features/workout-sync', () => ({
  openOutboxStore: jest.fn(),
  createOutboxRunner: jest.fn(),
  createWorkoutSyncTransport: jest.fn(),
}));
jest.mock('../src/features/workout-preload/service', () => ({
  createWorkoutPreloadReader: jest.fn(),
}));
const participant: PreloadParticipant = {
  bookingId: 'booking',
  clientRecordId: 'client',
  clientName: 'Client',
  programId: 'program',
  programName: 'Program',
  programDescription: '',
  baseTemplateId: 'template',
  programRevision: 1,
  workoutId: 'workout',
  workoutRevision: 1,
  workoutStatus: 'in_progress',
  exercises: [],
  assignedExercises: [],
};
const data = (p = participant): EntryRead => ({
  workout: { participant: p, tombstones: [] },
  draft: {
    workoutId: p.workoutId,
    bookingId: p.bookingId,
    focusExerciseId: null,
    values: {},
  },
  issues: [],
});
const resources = { catalog: [], conflicts: [] };
let current: SyncSession | null;
let outbox: ReturnType<typeof memoryStore>;
const drafts = {
  scope: session,
  getDeviceId: jest.fn(),
  read: jest.fn(),
  save: jest.fn(),
  close: jest.fn(),
  readResources: jest.fn(),
  saveResources: jest.fn(),
};
const read = jest.fn(async (p: PreloadParticipant) => data(p));
const run = jest.fn(async () => {});
const stop = jest.fn();
const load = jest.fn();
const hook = () =>
  renderHook(() => useWorkoutEntry(current, () => current, participant));
beforeEach(() => {
  jest.clearAllMocks();
  let uuid = 0;
  jest
    .mocked(randomUUID)
    .mockImplementation(
      () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
    );
  jest.mocked(openWorkoutPreloadStore).mockResolvedValue({
    scope: session,
    read: jest.fn(async () => null),
    save: jest.fn(async () => {}),
    close: jest.fn(async () => {}),
  } as unknown as Awaited<ReturnType<typeof openWorkoutPreloadStore>>);
  current = session;
  outbox = memoryStore();
  outbox.close = jest.fn(async () => {});
  drafts.getDeviceId.mockResolvedValue('device');
  drafts.close.mockResolvedValue(undefined);
  drafts.readResources.mockResolvedValue(null);
  drafts.saveResources.mockResolvedValue(undefined);
  read.mockImplementation(async (p) => data(p));
  jest
    .mocked(openOutboxStore)
    .mockResolvedValue(outbox as Awaited<ReturnType<typeof openOutboxStore>>);
  jest
    .mocked(openEntryDraftStore)
    .mockResolvedValue(
      drafts as unknown as Awaited<ReturnType<typeof openEntryDraftStore>>,
    );
  jest.mocked(WorkoutEntryService).mockImplementation(
    () =>
      ({
        read,
        flush: async () => {},
        pendingCount: async () => 1,
      }) as unknown as WorkoutEntryService,
  );
  jest.mocked(createOutboxRunner).mockReturnValue({ run, stop });
  jest.mocked(loadEntryResources).mockResolvedValue(resources);
  load.mockRejectedValue(new Error('offline'));
  jest.mocked(createWorkoutPreloadReader).mockReturnValue({ load });
});

it('closes stores and does not initialize a stale service after a delayed device lookup', async () => {
  const pending = deferred<string>();
  drafts.getDeviceId.mockReturnValue(pending.promise);
  const view = await hook();
  await waitFor(() => expect(drafts.getDeviceId).toHaveBeenCalled());
  current = null;
  await view.rerender({});
  await act(async () => pending.resolve('old-device'));
  await waitFor(() => expect(outbox.close).toHaveBeenCalled());
  expect(drafts.close).toHaveBeenCalled();
  expect(WorkoutEntryService).not.toHaveBeenCalled();
  expect(view.result.current.state).toBeNull();
});

it('discards a delayed read after logout and closes both stores', async () => {
  const pending = deferred<EntryRead>();
  read.mockReturnValue(pending.promise);
  const view = await hook();
  await waitFor(() => expect(read).toHaveBeenCalled());
  current = null;
  await view.rerender({});
  await act(async () => pending.resolve(data()));
  expect(view.result.current.state).toBeNull();
  expect(drafts.close).toHaveBeenCalled();
  expect(outbox.close).toHaveBeenCalledTimes(1);
});

it('does not publish late resources after logout', async () => {
  const pending = deferred<Awaited<ReturnType<typeof loadEntryResources>>>();
  jest.mocked(loadEntryResources).mockReturnValue(pending.promise);
  const view = await hook();
  await waitFor(() => expect(loadEntryResources).toHaveBeenCalled());
  current = null;
  await view.rerender({});
  await act(async () =>
    pending.resolve({
      catalog: [],
      conflicts: [
        { id: 'old', entityId: 'old', revision: 1, current: {}, incoming: {} },
      ],
    }),
  );
  expect(view.result.current.resources).toEqual(resources);
  expect(view.result.current.state).toBeNull();
  expect(outbox.close).toHaveBeenCalledTimes(1);
});

it('saves a draft without running delivery or claiming an outbox save', async () => {
  const view = await hook();
  await waitFor(() => expect(view.result.current.state).not.toBeNull());
  const action = jest.fn(async () => {});
  await act(async () => view.result.current.execute(action, false));
  expect(action).toHaveBeenCalledTimes(1);
  expect(run).not.toHaveBeenCalled();
  expect(view.result.current.sync).toBeNull();
  await view.unmount();
});

it('rereads confirmed delivery using refreshed server revisions', async () => {
  const refreshed = { ...participant, workoutRevision: 7 };
  const context: WorkoutPreloadContext = {
    version: 1,
    scope: session,
    sessionKey: 'booking',
    startsAt: '2026-10-03T10:00:00Z',
    loadedAt: '2026-10-03T10:00:00Z',
    participants: [refreshed],
  };
  load.mockResolvedValue(context);
  const view = await hook();
  await waitFor(() => expect(view.result.current.state).not.toBeNull());
  await act(async () => view.result.current.execute(async () => data()));
  await waitFor(() =>
    expect(view.result.current.state?.workout.participant.workoutRevision).toBe(
      7,
    ),
  );
  expect(run).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenLastCalledWith(refreshed);
  await view.unmount();
});

it('restores cached conflict choices when resource loading is offline', async () => {
  const cached = {
    catalog: [],
    conflicts: [
      {
        id: 'saved-conflict',
        entityId: 'saved-set',
        revision: 9,
        current: { reps: 8 },
        incoming: { reps: 10 },
      },
    ],
  };
  drafts.readResources.mockResolvedValue(cached);
  jest.mocked(loadEntryResources).mockRejectedValue(new Error('offline'));
  const view = await hook();
  await waitFor(() => expect(view.result.current.resources).toEqual(cached));
  expect(drafts.readResources).toHaveBeenCalledWith(participant.workoutId);
  expect(drafts.saveResources).not.toHaveBeenCalled();
  expect(view.result.current.error).toBe(false);
  await view.unmount();
});

it.each(['current', 'incoming'] as const)(
  'delivers a real replacement conflict and explicit %s choice, refreshes and reopens with both cached audit versions',
  async (selection) => {
    const actualService = jest.requireActual<
      typeof import('../src/features/workout-entry/service')
    >('../src/features/workout-entry/service');
    const actualSync = jest.requireActual<
      typeof import('../src/features/workout-sync')
    >('../src/features/workout-sync');
    const { TransactionalFixture } = jest.requireActual<
      typeof import('./workout-sync-sqlite-fixture')
    >('./workout-sync-sqlite-fixture');
    const sqlite = new TransactionalFixture();
    const realOutbox = await actualSync.openOutboxStore(
      session,
      sqlite.connect(),
    );
    const exercise = {
      id: 'exercise',
      exerciseId: 'catalog',
      name: 'Original',
      measure: 'reps' as const,
      bodyweight: false,
      muscleGroup: '',
      equipment: '',
      instructions: [],
      sourceKey: null,
      skipped: false,
      replacedFromId: null,
      position: 0,
      plannedSets: 3,
      plannedReps: '8',
      plannedSeconds: null,
      plannedWeightGrams: null,
      restSeconds: 60,
      revision: 1,
      sets: [],
      previousSets: [],
    };
    let server: PreloadParticipant = { ...participant, exercises: [exercise] };
    let draft: EntryRead['draft'] | null = null;
    let cached: Awaited<ReturnType<typeof loadEntryResources>> | null = null;
    const audit = {
      id: 'replacement-conflict',
      entityId: '',
      revision: 2,
      current: { exercise_id: 'catalog', device_id: 'other-phone' },
      incoming: { exercise_id: 'replacement-catalog', device_id: 'device' },
    };
    let offline = false;
    let calls = 0;
    let resolved = false;
    let preloadContext: WorkoutPreloadContext | null = null;
    const preloadCache = {
      scope: session,
      read: jest.fn(async () => preloadContext),
      save: jest.fn(async (context: WorkoutPreloadContext) => {
        preloadContext = context;
      }),
      close: jest.fn(async () => {}),
    };
    jest
      .mocked(openWorkoutPreloadStore)
      .mockResolvedValue(
        preloadCache as unknown as Awaited<
          ReturnType<typeof openWorkoutPreloadStore>
        >,
      );
    jest
      .mocked(openOutboxStore)
      .mockImplementation(async () =>
        actualSync.openOutboxStore(session, sqlite.connect()),
      );
    drafts.read.mockImplementation(async () => draft);
    drafts.save.mockImplementation(async (value: EntryRead['draft']) => {
      draft = value;
    });
    drafts.readResources.mockImplementation(async () => cached);
    drafts.saveResources.mockImplementation(async (_id, value) => {
      cached = value;
    });
    jest
      .mocked(WorkoutEntryService)
      .mockImplementation(
        (options) => new actualService.WorkoutEntryService(options),
      );
    jest.mocked(createOutboxRunner).mockImplementation((options) =>
      actualSync.createOutboxRunner({
        ...options,
        transport: {
          apply: async (_session, operations) => {
            if (offline) throw new Error('offline');
            calls++;
            const operation = operations[0]!;
            if (operation.kind === 'replace_exercise') {
              audit.entityId = operation.entity_id;
              server = { ...server, exercises: [{ ...exercise, revision: 2 }] };
              return {
                account_id: session.accountId,
                workspace_id: session.workspaceId,
                results: [
                  {
                    operation_id: operation.operation_id,
                    entity_id: operation.entity_id,
                    status: 'conflict',
                    revision: 2,
                    conflict_id: audit.id,
                  },
                ],
              };
            }
            expect(operation.kind).toBe('resolve_conflict');
            resolved = true;
            expect(operation.payload.selected_version).toBe(selection);
            server = {
              ...server,
              exercises:
                selection === 'current'
                  ? [{ ...exercise, revision: 3 }]
                  : [
                      { ...exercise, skipped: true, revision: 3 },
                      {
                        ...exercise,
                        id: audit.entityId,
                        exerciseId: 'replacement-catalog',
                        replacedFromId: exercise.id,
                        position: 1,
                        revision: 3,
                      },
                    ],
            };
            return {
              account_id: session.accountId,
              workspace_id: session.workspaceId,
              results: [
                {
                  operation_id: operation.operation_id,
                  entity_id: operation.entity_id,
                  status: 'applied',
                  revision: 3,
                },
              ],
            };
          },
        },
      }),
    );
    load.mockImplementation(async () => ({
      version: 1,
      scope: session,
      sessionKey: 'booking',
      startsAt: '2026-10-03T10:00:00Z',
      loadedAt: '2026-10-03T10:00:00Z',
      participants: [server],
    }));
    jest.mocked(loadEntryResources).mockImplementation(async () => {
      if (offline || resolved) throw new Error('resources_offline');
      return { catalog: [], conflicts: audit.entityId ? [audit] : [] };
    });
    const view = await renderHook(() =>
      useWorkoutEntry(current, () => current, server),
    );
    await waitFor(() => expect(view.result.current.state).not.toBeNull());
    await act(async () =>
      view.result.current.execute((service) =>
        service.add(
          server,
          { ...exercise, exerciseId: 'replacement-catalog' },
          exercise.id,
        ),
      ),
    );
    await waitFor(() =>
      expect(view.result.current.state?.issues).toHaveLength(1),
    );
    await waitFor(() =>
      expect(view.result.current.resources.conflicts).toEqual([audit]),
    );
    const snapshot = JSON.stringify(audit);
    offline = true;
    await act(async () =>
      view.result.current.execute((service) =>
        service.resolve(server, audit.entityId, audit.id, selection, 2),
      ),
    );
    await waitFor(() => expect(view.result.current.sync?.status).toBe('error'));
    const retry = (await realOutbox.pending())[0]!.operation;
    expect(view.result.current.state?.issues).toHaveLength(1);
    offline = false;
    await act(async () => view.result.current.retryDelivery());
    await waitFor(() => expect(view.result.current.state?.issues).toEqual([]));
    await waitFor(() =>
      expect(view.result.current.state?.workout.participant.exercises).toEqual(
        server.exercises,
      ),
    );
    expect(calls).toBe(2);
    expect(preloadCache.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ participants: [server] }),
    );
    expect(preloadCache.close).toHaveBeenCalled();
    expect(await realOutbox.pending()).toEqual([]);
    expect(retry.payload.selected_version).toBe(selection);
    expect(JSON.stringify(view.result.current.resources.conflicts[0])).toBe(
      snapshot,
    );
    await view.unmount();
    offline = true;
    const staleParticipant = { ...participant, exercises: [exercise] };
    const reopened = await renderHook(() =>
      useWorkoutEntry(current, () => current, staleParticipant),
    );
    await waitFor(() =>
      expect(
        reopened.result.current.state?.workout.participant.exercises,
      ).toEqual(server.exercises),
    );
    expect(reopened.result.current.state?.issues).toEqual([]);
    expect(reopened.result.current.resources.conflicts).toEqual([audit]);
    expect(JSON.stringify(audit)).toBe(snapshot);
    await reopened.unmount();
    await realOutbox.close();
  },
);

it('discards an old participant refresh after switching workouts in the same session', async () => {
  const pending = deferred<WorkoutPreloadContext>();
  load.mockReturnValue(pending.promise);
  const second = {
    ...participant,
    bookingId: 'second-booking',
    workoutId: 'second-workout',
  };
  const view = await renderHook(
    ({ person }: { person: PreloadParticipant }) =>
      useWorkoutEntry(current, () => current, person),
    { initialProps: { person: participant } },
  );
  await waitFor(() => expect(view.result.current.state).not.toBeNull());
  await act(async () => view.result.current.retryDelivery());
  await waitFor(() => expect(load).toHaveBeenCalled());
  await view.rerender({ person: second });
  await waitFor(() =>
    expect(view.result.current.state?.workout.participant.workoutId).toBe(
      second.workoutId,
    ),
  );
  await act(async () =>
    pending.resolve({
      version: 1,
      scope: session,
      sessionKey: participant.bookingId,
      startsAt: '2026-10-03T10:00:00Z',
      loadedAt: '2026-10-03T10:00:00Z',
      participants: [{ ...participant, workoutRevision: 99 }],
    }),
  );
  expect(view.result.current.state?.workout.participant.workoutId).toBe(
    second.workoutId,
  );
  expect(view.result.current.state?.workout.participant.workoutRevision).toBe(
    1,
  );
  const cache = await jest.mocked(openWorkoutPreloadStore).mock.results[0]!
    .value;
  expect(cache.save).not.toHaveBeenCalled();
  await view.unmount();
});

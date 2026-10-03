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

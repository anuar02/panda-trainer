import { randomUUID } from 'expo-crypto';
import { openWorkoutPreloadStore } from '../src/features/workout-preload/storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PreloadParticipant } from '../src/domain/workout-preload/types';
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
const finish = jest.fn(async (p: PreloadParticipant) => data(p));
const hook = () =>
  renderHook(() => useWorkoutEntry(current, () => current, participant));
beforeEach(() => {
  jest.clearAllMocks();
  finish.mockImplementation(async (p) => data(p));
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
        finish,
        flush: async () => {},
        pendingCount: async () => 1,
      }) as unknown as WorkoutEntryService,
  );
  jest.mocked(createOutboxRunner).mockReturnValue({ run, stop });
  jest.mocked(loadEntryResources).mockResolvedValue(resources);
  load.mockRejectedValue(new Error('offline'));
  jest.mocked(createWorkoutPreloadReader).mockReturnValue({ load });
});

it('suppresses a second finish while durable persistence is unresolved', async () => {
  const pending = deferred<EntryRead>();
  finish.mockReturnValue(pending.promise);
  const view = await hook();
  await waitFor(() => expect(view.result.current.state).not.toBeNull());
  let first!: Promise<void>;
  await act(async () => {
    first = view.result.current.finish();
    await view.result.current.finish();
  });
  expect(finish).toHaveBeenCalledTimes(1);
  expect(run).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve(data());
    await first;
  });
  expect(run).toHaveBeenCalledTimes(1);
});

it('does not start delivery or publish late completion after logout and relogin', async () => {
  const pending = deferred<EntryRead>();
  finish.mockReturnValue(pending.promise);
  const view = await hook();
  await waitFor(() => expect(view.result.current.state).not.toBeNull());
  let completion!: Promise<void>;
  await act(async () => {
    completion = view.result.current.finish();
  });
  current = null;
  await view.rerender({});
  current = { ...session, sessionId: 'relogin' };
  await view.rerender({});
  await waitFor(() => expect(view.result.current.state).not.toBeNull());
  const old = data();
  old.workout.participant = { ...participant, workoutStatus: 'finished' };
  await act(async () => {
    pending.resolve(old);
    await completion;
  });
  expect(view.result.current.state?.workout.participant.workoutStatus).toBe(
    'in_progress',
  );
  expect(run).not.toHaveBeenCalled();
});

it('does not start delivery after a finish completes following unmount', async () => {
  const pending = deferred<EntryRead>();
  finish.mockReturnValue(pending.promise);
  const view = await hook();
  await waitFor(() => expect(view.result.current.state).not.toBeNull());
  let completion!: Promise<void>;
  await act(async () => {
    completion = view.result.current.finish();
  });
  await view.unmount();
  await act(async () => {
    pending.resolve(data());
    await completion;
  });
  expect(run).not.toHaveBeenCalled();
  expect(stop).toHaveBeenCalled();
  expect(drafts.close).toHaveBeenCalled();
});

it('surfaces local failure and permits explicit retry without sending before persistence', async () => {
  finish.mockRejectedValueOnce(new Error('local_save_failed'));
  const view = await hook();
  await waitFor(() => expect(view.result.current.state).not.toBeNull());
  await act(async () => {
    await view.result.current.finish();
  });
  expect(view.result.current.error).toBe(true);
  expect(run).not.toHaveBeenCalled();
  await act(async () => {
    await view.result.current.finish();
  });
  expect(finish).toHaveBeenCalledTimes(2);
  expect(run).toHaveBeenCalledTimes(1);
});

it('does not overwrite a newer finished snapshot or its cache when an earlier delivery refresh arrives late', async () => {
  const oldRefresh = deferred<{
    version: 1;
    scope: typeof session;
    sessionKey: string;
    startsAt: string;
    loadedAt: string;
    participants: PreloadParticipant[];
  }>();
  const newRefresh =
    deferred<typeof oldRefresh.promise extends Promise<infer T> ? T : never>();
  const cacheSave = jest.fn(
    async (_context: { participants: PreloadParticipant[] }) => {},
  );
  jest.mocked(openWorkoutPreloadStore).mockResolvedValue({
    scope: session,
    read: jest.fn(async () => null),
    save: cacheSave,
    close: jest.fn(async () => {}),
  } as unknown as Awaited<ReturnType<typeof openWorkoutPreloadStore>>);
  load
    .mockReturnValueOnce(oldRefresh.promise)
    .mockReturnValueOnce(newRefresh.promise);
  const view = await hook();
  await waitFor(() => expect(view.result.current.state).not.toBeNull());
  await act(async () => {
    await view.result.current.execute(async () => data());
  });
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await act(async () => {
    await view.result.current.finish();
  });
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  const context = (p: PreloadParticipant) => ({
    version: 1 as const,
    scope: session,
    sessionKey: p.bookingId,
    startsAt: '2026-10-04T10:00:00Z',
    loadedAt: '2026-10-04T11:00:00Z',
    participants: [p],
  });
  const fresh = {
    ...participant,
    workoutRevision: 9,
    workoutStatus: 'finished' as const,
  };
  await act(async () => {
    newRefresh.resolve(context(fresh));
  });
  await waitFor(() =>
    expect(view.result.current.state?.workout.participant.workoutRevision).toBe(
      9,
    ),
  );
  const stale = {
    ...participant,
    workoutRevision: 7,
    workoutStatus: 'in_progress' as const,
  };
  await act(async () => {
    oldRefresh.resolve(context(stale));
  });
  expect(view.result.current.state?.workout.participant.workoutRevision).toBe(
    9,
  );
  expect(view.result.current.state?.workout.participant.workoutStatus).toBe(
    'finished',
  );
  expect(cacheSave).toHaveBeenCalledWith(context(fresh));
  expect(
    cacheSave.mock.calls.every(
      ([saved]) =>
        saved.participants[0]?.workoutRevision === 9 &&
        saved.participants[0]?.workoutStatus === 'finished',
    ),
  ).toBe(true);
});

import { WorkoutPreloadReadError } from '@/features/workout-preload/service';
import type {
  WorkoutPreloadContext,
  WorkoutPreloadStore,
  WorkoutRecovery,
} from '@/domain/workout-preload/types';
import type { SyncSession } from '@/domain/workout-sync/types';
import {
  createWorkoutPreloadLifecycle,
  type PreloadState,
} from '@/features/workout-preload/lifecycle';

const session: SyncSession = {
  accountId: 'account',
  workspaceId: 'workspace',
  sessionId: 'session',
  accessToken: 'token',
};
const context: WorkoutPreloadContext = {
  version: 1,
  scope: session,
  sessionKey: 'booking-1',
  startsAt: '2026-10-03T10:00:00Z',
  loadedAt: '2026-10-03T09:00:00Z',
  participants: [1, 2, 3].map((id) => ({
    bookingId: `booking-${id}`,
    clientRecordId: `client-${id}`,
    clientName: `Client ${id}`,
    programId: `program-${id}`,
    programName: `Program ${id}`,
    programDescription: `Description ${id}`,
    baseTemplateId: `template-${id}`,
    programRevision: 1,
    workoutId: `workout-${id}`,
    workoutRevision: 1,
    workoutStatus: 'in_progress',
    exercises: [],
    assignedExercises: [],
  })),
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(
  savedContext: WorkoutPreloadContext | null = null,
  savedRecovery: WorkoutRecovery | null = null,
) {
  let currentSession: SyncSession | null = session;
  let storedContext = savedContext;
  let storedRecovery = savedRecovery;
  const states: PreloadState[] = [];
  const store: WorkoutPreloadStore = {
    scope: session,
    read: jest.fn(async () => storedContext),
    save: jest.fn(async (value) => {
      storedContext = value;
    }),
    readRecovery: jest.fn(async () => storedRecovery),
    saveRecovery: jest.fn(async (value) => {
      storedRecovery = value;
    }),
    close: jest.fn(async () => {}),
  };
  const reader = { load: jest.fn(async () => context) };
  const lifecycle = createWorkoutPreloadLifecycle({
    session,
    getSession: () => currentSession,
    store,
    reader,
    onState: (state) => states.push(state),
  });
  return {
    lifecycle,
    store,
    reader,
    states,
    latest: () => {
      const state = states[states.length - 1];
      if (!state) throw new Error('No published state');
      return state;
    },
    setSession: (value: SyncSession | null) => {
      currentSession = value;
    },
    persisted: () => ({ context: storedContext, recovery: storedRecovery }),
  };
}

describe('workout preload lifecycle with an in-memory mocked store, not real SQLite', () => {
  it('preserves three participants and the selected collapsed workout across reopen', async () => {
    const first = fixture();
    await first.lifecycle.hydrate();
    await first.lifecycle.open('booking-1');
    await first.lifecycle.select('client-3');
    await first.lifecycle.collapse(true);
    const saved = first.persisted();
    await first.lifecycle.stop();
    const reopened = fixture(saved.context, saved.recovery);
    await reopened.lifecycle.hydrate();
    expect(reopened.latest()).toMatchObject({
      status: 'ready',
      cached: true,
      context: { participants: context.participants },
      recovery: {
        bookingId: 'booking-3',
        clientRecordId: 'client-3',
        collapsed: true,
      },
    });
    expect(reopened.reader.load).not.toHaveBeenCalled();
    await reopened.lifecycle.collapse(false);
    expect(reopened.latest().recovery).toMatchObject({
      clientRecordId: 'client-3',
      collapsed: false,
    });
  });
  it('uses all cached participant programs when offline', async () => {
    const test = fixture(context);
    test.reader.load.mockRejectedValue(new WorkoutPreloadReadError('network'));
    await test.lifecycle.hydrate();
    await test.lifecycle.open('booking-2');
    expect(test.latest()).toMatchObject({
      status: 'ready',
      cached: true,
      recovery: { bookingId: 'booking-2', clientRecordId: 'client-2' },
    });
    expect(
      test
        .latest()
        .context?.participants.map((participant) => participant.programId),
    ).toEqual(['program-1', 'program-2', 'program-3']);
  });
  it('reports unavailable for an uncached offline booking', async () => {
    const test = fixture();
    test.reader.load.mockRejectedValue(new WorkoutPreloadReadError('network'));
    await test.lifecycle.hydrate();
    await test.lifecycle.open('booking-1');
    expect(test.latest()).toMatchObject({
      status: 'error',
      error: 'unavailable',
      context: null,
      recovery: null,
    });
    expect(test.store.saveRecovery).not.toHaveBeenCalled();
  });
  it('blocks opening during hydration and on missing recovery context', async () => {
    const test = fixture(null, {
      version: 1,
      sessionKey: 'missing',
      bookingId: 'booking-1',
      clientRecordId: 'client-1',
      collapsed: true,
    });
    await test.lifecycle.open('booking-1');
    expect(test.reader.load).not.toHaveBeenCalled();
    await test.lifecycle.hydrate();
    expect(test.latest()).toMatchObject({ status: 'error', error: 'storage' });
    await test.lifecycle.open('booking-1');
    expect(test.reader.load).not.toHaveBeenCalled();
  });
  it.each(['logout', 'workspace', 'account', 'token', 'session'] as const)(
    'discards delayed recovery after %s changes',
    async (change) => {
      const test = fixture(context);
      const pending = deferred<WorkoutRecovery | null>();
      jest.mocked(test.store.readRecovery).mockReturnValue(pending.promise);
      const hydration = test.lifecycle.hydrate();
      await Promise.resolve();
      const changed = { ...session };
      if (change === 'workspace') changed.workspaceId = 'other';
      if (change === 'account') changed.accountId = 'other';
      if (change === 'token') changed.accessToken = 'other';
      if (change === 'session') changed.sessionId = 'other';
      test.setSession(change === 'logout' ? null : changed);
      pending.resolve({
        version: 1,
        sessionKey: context.sessionKey,
        bookingId: 'booking-1',
        clientRecordId: 'client-1',
        collapsed: true,
      });
      await hydration;
      expect(test.states).toEqual([]);
      expect(test.store.read).not.toHaveBeenCalled();
    },
  );
  it('discards delayed remote data after logout without writing storage', async () => {
    const test = fixture();
    const pending = deferred<WorkoutPreloadContext>();
    test.reader.load.mockReturnValue(pending.promise);
    await test.lifecycle.hydrate();
    const opening = test.lifecycle.open('booking-1');
    await Promise.resolve();
    await Promise.resolve();
    test.setSession(null);
    pending.resolve(context);
    await opening;
    expect(test.store.save).not.toHaveBeenCalled();
    expect(test.store.saveRecovery).not.toHaveBeenCalled();
    expect(test.states.some((state) => state.context !== null)).toBe(false);
  });
  it('waits for an in-flight write before closing and skips queued writes', async () => {
    const test = fixture();
    await test.lifecycle.hydrate();
    await test.lifecycle.open('booking-1');
    const pending = deferred<void>();
    const saveRecovery = jest
      .mocked(test.store.saveRecovery)
      .getMockImplementation()!;
    jest
      .mocked(test.store.saveRecovery)
      .mockImplementationOnce(async (value) => {
        await pending.promise;
        await saveRecovery(value);
      });
    const selecting = test.lifecycle.select('client-2');
    await Promise.resolve();
    const collapsing = test.lifecycle.collapse(true);
    const stopping = test.lifecycle.stop();
    expect(test.store.close).not.toHaveBeenCalled();
    pending.resolve(undefined);
    await Promise.all([selecting, collapsing, stopping]);
    expect(test.store.saveRecovery).toHaveBeenCalledTimes(2);
    expect(test.store.close).toHaveBeenCalledTimes(1);
    expect(test.persisted().recovery).toMatchObject({
      clientRecordId: 'client-2',
      collapsed: false,
    });
    expect(test.latest().recovery).toMatchObject({
      clientRecordId: 'client-1',
      collapsed: false,
    });
  });
});

it.each(['unavailable', 'request', 'invalidInput', 'configuration'] as const)(
  'does not revive cached data after a %s response',
  async (code) => {
    const test = fixture(context);
    test.reader.load.mockRejectedValue(new WorkoutPreloadReadError(code));
    await test.lifecycle.hydrate();
    await test.lifecycle.open('booking-1');
    expect(test.latest()).toMatchObject({
      status: 'error',
      error: 'unavailable',
      context: null,
      recovery: null,
    });
    expect(test.store.saveRecovery).not.toHaveBeenCalled();
  },
);

it('discards a delayed cached read after workspace switch', async () => {
  const test = fixture();
  const pending = deferred<WorkoutPreloadContext | null>();
  jest.mocked(test.store.read).mockReturnValue(pending.promise);
  await test.lifecycle.hydrate();
  const opening = test.lifecycle.open('booking-1');
  await Promise.resolve();
  test.setSession({ ...session, workspaceId: 'other' });
  pending.resolve(context);
  await opening;
  expect(test.reader.load).not.toHaveBeenCalled();
  expect(test.store.saveRecovery).not.toHaveBeenCalled();
  expect(test.states.some((state) => state.context !== null)).toBe(false);
});

it('does not treat an unknown reader error as offline permission to use cached data', async () => {
  const test = fixture(context);
  test.reader.load.mockRejectedValue(new Error('unexpected'));
  await test.lifecycle.hydrate();
  await test.lifecycle.open('booking-1');
  expect(test.latest()).toMatchObject({
    status: 'error',
    error: 'unavailable',
    context: null,
  });
  expect(test.store.saveRecovery).not.toHaveBeenCalled();
});

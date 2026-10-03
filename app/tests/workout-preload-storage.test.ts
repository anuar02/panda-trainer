import type { WorkoutPreloadContext } from '../src/domain/workout-preload/types';
import type {
  SQLiteDriver,
  SQLiteParameter,
} from '../src/features/workout-sync/storage';
import { openWorkoutPreloadStore } from '../src/features/workout-preload/storage';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { accountId: id(1), workspaceId: id(2) };
class MockSQLite {
  rows = new Map<string, string>();
  fail = false;
  failRecovery = false;
  connect(): SQLiteDriver {
    const fixture = this;
    const key = (sql: string, parameters: SQLiteParameter[]) =>
      JSON.stringify([
        sql.includes('recovery') ? 'recovery' : 'context',
        ...parameters,
      ]);
    const database: SQLiteDriver = {
      execAsync: async () => undefined,
      closeAsync: async () => undefined,
      runAsync: async (sql, ...parameters) => {
        fixture.rows.set(
          key(sql, parameters.slice(0, -1)),
          String(parameters.at(-1)),
        );
        if (fixture.fail || (fixture.failRecovery && sql.includes('recovery')))
          throw new Error('interrupted transaction');
      },
      getFirstAsync: async <T>(
        sql: string,
        ...parameters: SQLiteParameter[]
      ) => {
        const value = fixture.rows.get(key(sql, parameters));
        return value === undefined ? null : ({ value_json: value } as T);
      },
      getAllAsync: async <T>(sql: string, ...parameters: SQLiteParameter[]) => {
        const prefix = key(sql, parameters).slice(0, -1);
        return [...fixture.rows]
          .filter(([row]) => row.startsWith(prefix))
          .map(([, value]) => ({ value_json: value }) as T);
      },
      withExclusiveTransactionAsync: async (task) => {
        const previous = new Map(fixture.rows);
        try {
          await task(database);
        } catch (error) {
          fixture.rows = previous;
          throw error;
        }
      },
    };
    return database;
  }
}
function context(): WorkoutPreloadContext {
  return {
    version: 1,
    scope,
    sessionKey: 'group-session',
    startsAt: '2026-10-03T10:00:00Z',
    loadedAt: '2026-10-03T09:00:00Z',
    participants: [10, 20, 30]
      .map((n) => ({
        bookingId: id(n),
        clientRecordId: id(n + 1),
        clientName: `Synthetic ${n}`,
        programId: id(n + 2),
        programName: 'Synthetic program',
        programDescription: '',
        baseTemplateId: id(300),
        programRevision: 1,
        workoutId: id(n + 3),
        workoutRevision: 0,
        workoutStatus: 'not_created' as const,
        exercises: [
          {
            id: id(n + 4),
            exerciseId: id(100),
            name: 'Synthetic exercise',
            bodyweight: false,
            muscleGroup: '',
            equipment: '',
            instructions: [],
            sourceKey: null,
            skipped: false,
            replacedFromId: null,
            measure: 'reps' as const,
            position: 0,
            plannedSets: 0,
            plannedReps: '8–12',
            plannedSeconds: null,
            plannedWeightGrams: 1500,
            restSeconds: 60,
            revision: 0,
            sets: [],
            previousSets: [],
          },
        ],
      }))
      .map((participant) => ({
        ...participant,
        assignedExercises: participant.exercises.map((exercise) => ({
          ...exercise,
        })),
      })),
  };
}
describe('SQLite preload with transactional mock, not native runtime', () => {
  test('three isolated participants, booking alias and recovery survive close and scope switches', async () => {
    const fixture = new MockSQLite();
    const store = await openWorkoutPreloadStore(scope, fixture.connect());
    const value = context();
    const recovery = {
      version: 1 as const,
      sessionKey: value.sessionKey,
      bookingId: id(20),
      clientRecordId: id(21),
      collapsed: true,
    };
    await store.save(value);
    await store.saveRecovery(recovery);
    expect((await store.read(id(30)))?.participants).toEqual(
      value.participants,
    );
    await store.close();
    await expect(store.read(value.sessionKey)).rejects.toThrow('closed');
    for (const isolated of [
      { ...scope, accountId: id(3) },
      { ...scope, workspaceId: id(4) },
    ]) {
      const other = await openWorkoutPreloadStore(isolated, fixture.connect());
      expect(await other.read(value.sessionKey)).toBeNull();
      expect(await other.readRecovery()).toBeNull();
      await other.close();
    }
    const reopened = await openWorkoutPreloadStore(scope, fixture.connect());
    expect(await reopened.readRecovery()).toEqual(recovery);
    expect(await reopened.read(value.sessionKey)).toEqual(value);
    await expect(
      reopened.saveRecovery({ ...recovery, clientRecordId: id(31) }),
    ).rejects.toThrow('Unknown');
  });
  test('interrupted cached and uncached writes roll back and queued close drains edits', async () => {
    const fixture = new MockSQLite();
    const store = await openWorkoutPreloadStore(scope, fixture.connect());
    const value = context();
    fixture.fail = true;
    await expect(store.save(value)).rejects.toThrow('interrupted');
    expect(await store.read(value.sessionKey)).toBeNull();
    fixture.fail = false;
    await store.save(value);
    const edited = context();
    edited.loadedAt = '2026-10-03T09:30:00Z';
    fixture.fail = true;
    await expect(store.save(edited)).rejects.toThrow('interrupted');
    expect(await store.read(value.sessionKey)).toEqual(value);
    fixture.fail = false;
    const pending = store.save(edited);
    edited.loadedAt = 'invalid late mutation';
    await Promise.all([pending, store.close()]);
    const reopened = await openWorkoutPreloadStore(scope, fixture.connect());
    expect((await reopened.read(value.sessionKey))?.loadedAt).toBe(
      '2026-10-03T09:30:00Z',
    );
  });
  test('refresh freezes assignment snapshot and local UUID until authoritative server journal', async () => {
    const fixture = new MockSQLite();
    const store = await openWorkoutPreloadStore(scope, fixture.connect());
    await store.save(context());
    const refresh = context();
    refresh.participants[0]!.workoutId = id(200);
    refresh.participants[0]!.exercises[0]!.plannedReps = '20';
    await store.save(refresh);
    expect(
      (await store.read(refresh.sessionKey))?.participants[0]?.workoutId,
    ).toBe(id(13));
    expect(
      (await store.read(refresh.sessionKey))?.participants[0]?.exercises[0]
        ?.plannedReps,
    ).toBe('8–12');
    refresh.participants[0]!.workoutStatus = 'in_progress';
    await store.save(refresh);
    expect(
      (await store.read(refresh.sessionKey))?.participants[0]?.workoutId,
    ).toBe(id(200));
  });
  test('context and changed recovery commit together or both roll back', async () => {
    const fixture = new MockSQLite();
    const store = await openWorkoutPreloadStore(scope, fixture.connect());
    const initial = context();
    const recovery = {
      version: 1 as const,
      sessionKey: initial.sessionKey,
      bookingId: id(10),
      clientRecordId: id(11),
      collapsed: true,
    };
    await store.save(initial, recovery);
    const refreshed = context();
    refreshed.participants = refreshed.participants.slice(1);
    const selected = {
      ...recovery,
      bookingId: id(20),
      clientRecordId: id(21),
      collapsed: false,
    };
    await expect(store.save(refreshed)).rejects.toThrow('invalidate');
    expect(await store.read(initial.sessionKey)).toEqual(initial);
    fixture.failRecovery = true;
    await expect(store.save(refreshed, selected)).rejects.toThrow(
      'interrupted',
    );
    expect(await store.read(initial.sessionKey)).toEqual(initial);
    expect(await store.readRecovery()).toEqual(recovery);
    fixture.failRecovery = false;
    await store.save(refreshed, selected);
    expect(await store.read(initial.sessionKey)).toEqual(refreshed);
    expect(await store.readRecovery()).toEqual(selected);
    await store.close();
    const reopened = await openWorkoutPreloadStore(scope, fixture.connect());
    expect(await reopened.readRecovery()).toEqual(selected);
  });
  test('refresh updates history hints without changing frozen assignment definition', async () => {
    const fixture = new MockSQLite();
    const store = await openWorkoutPreloadStore(scope, fixture.connect());
    await store.save(context());
    const refresh = context();
    const history = [
      {
        id: id(400),
        revision: 1,
        position: 0,
        weightGrams: 2000,
        reps: 12,
        seconds: null,
      },
    ];
    refresh.participants[0]!.assignedExercises[0]!.previousSets = history;
    refresh.participants[0]!.assignedExercises[0]!.plannedReps = '20';
    refresh.participants[0]!.exercises[0]!.previousSets = history;
    await store.save(refresh);
    const saved = (await store.read(refresh.sessionKey))!.participants[0]!;
    expect(saved.assignedExercises[0]!.previousSets).toEqual(history);
    expect(saved.assignedExercises[0]!.plannedReps).toBe('8–12');
    expect(saved.exercises[0]!.previousSets).toEqual(history);
  });
  test('current empty server journal retains frozen assigned snapshot independently', async () => {
    const fixture = new MockSQLite();
    const store = await openWorkoutPreloadStore(scope, fixture.connect());
    const initial = context();
    await store.save(initial);
    const refresh = context();
    const participant = refresh.participants[0]!;
    participant.workoutStatus = 'in_progress';
    participant.workoutId = id(201);
    participant.exercises = [];
    participant.assignedExercises[0]!.id = id(202);
    participant.assignedExercises[0]!.plannedReps = '20';
    await store.save(refresh);
    const stored = (await store.read(refresh.sessionKey))!.participants[0]!;
    expect(stored.exercises).toEqual([]);
    expect(stored.workoutId).toBe(id(201));
    expect(stored.assignedExercises).toEqual(
      initial.participants[0]!.assignedExercises,
    );
    expect(() =>
      store.save({
        ...refresh,
        participants: refresh.participants.map((item) => ({
          ...item,
          assignedExercises: [],
        })),
      }),
    ).toThrow('Invalid');
  });
  test('rejects private keys and cached scope substitution at every boundary', async () => {
    const fixture = new MockSQLite();
    const store = await openWorkoutPreloadStore(scope, fixture.connect());
    const value = context();
    await store.save(value);
    for (const malicious of [
      { ...value, privateNote: 'private' },
      { ...value, scope: { ...scope, token: 'private' } },
      {
        ...value,
        participants: value.participants.map((item) => ({
          ...item,
          privateNote: 'private',
        })),
      },
      {
        ...value,
        participants: value.participants.map((item) => ({
          ...item,
          exercises: item.exercises.map((exercise) => ({
            ...exercise,
            privateNote: 'private',
          })),
        })),
      },
      { ...value, scope: { ...scope, accountId: id(999) } },
    ])
      expect(() => store.save(malicious)).toThrow('Invalid');
    const key = JSON.stringify([
      'context',
      scope.accountId,
      scope.workspaceId,
      value.sessionKey,
    ]);
    fixture.rows.set(
      key,
      JSON.stringify({ ...value, scope: { ...scope, accountId: id(999) } }),
    );
    await expect(store.read(value.sessionKey)).rejects.toThrow('Invalid');
  });
  test('invalid hydration cannot replace old context and corrupt stored JSON throws', async () => {
    const fixture = new MockSQLite();
    const store = await openWorkoutPreloadStore(scope, fixture.connect());
    const value = context();
    await store.save(value);
    expect(() => store.save({ ...value, participants: [] })).toThrow('Invalid');
    expect(await store.read(value.sessionKey)).toEqual(value);
    const invalid = context();
    invalid.participants[0]!.exercises[0]!.plannedWeightGrams = 1.5;
    expect(() => store.save(invalid)).toThrow('Invalid');
    fixture.rows.set(
      JSON.stringify([
        'context',
        scope.accountId,
        scope.workspaceId,
        value.sessionKey,
      ]),
      '{"version":1}',
    );
    await expect(store.read(value.sessionKey)).rejects.toThrow('Invalid');
    await expect(store.save(value)).rejects.toThrow('Invalid');
  });
});

import { openEntryDraftStore } from '@/features/workout-entry/storage';
import type {
  SQLiteDriver,
  SQLiteParameter,
} from '@/features/workout-sync/storage';
const scope = { accountId: 'account', workspaceId: 'workspace' };
function fixture() {
  const rows = new Map<string, string>();
  let fail = false;
  const driver: SQLiteDriver = {
    execAsync: async () => undefined,
    runAsync: async (sql: string, ...parameters: SQLiteParameter[]) => {
      const prefix = sql.includes('resources') ? 'resources:' : '';
      const key =
        prefix + parameters.slice(0, sql.includes('devices') ? 2 : 3).join(':');
      rows.set(key, String(parameters.at(-1)));
      if (fail) throw new Error('disk_failed');
    },
    getFirstAsync: async <T>(sql: string, ...parameters: SQLiteParameter[]) => {
      const value = rows.get(
        (sql.includes('resources') ? 'resources:' : '') + parameters.join(':'),
      );
      return (
        value === undefined
          ? null
          : sql.includes('devices')
            ? { device_id: value }
            : { value_json: value }
      ) as T | null;
    },
    getAllAsync: async () => [],
    withExclusiveTransactionAsync: async (task) => {
      const before = new Map(rows);
      try {
        await task(driver);
      } catch (error) {
        rows.clear();
        before.forEach((value, key) => rows.set(key, value));
        throw error;
      }
    },
    closeAsync: async () => undefined,
  };
  return {
    driver,
    setFail: (value: boolean) => {
      fail = value;
    },
  };
}
it('persists three independent participant drafts and device identity across reopen without journal operations', async () => {
  const database = fixture();
  const first = await openEntryDraftStore(scope, database.driver);
  expect(await first.getDeviceId(() => 'phone')).toBe('phone');
  for (let index = 0; index < 3; index++)
    await first.save({
      workoutId: `workout-${index}`,
      bookingId: `booking-${index}`,
      focusExerciseId: 'exercise',
      values: {
        exercise: {
          weightGrams: index === 0 ? null : index * 1000,
          reps: index,
          seconds: null,
        },
      },
    });
  await first.close();
  const reopened = await openEntryDraftStore(scope, database.driver);
  expect(await reopened.getDeviceId(() => 'different')).toBe('phone');
  expect(
    (await reopened.read('workout-0'))?.values.exercise?.weightGrams,
  ).toBeNull();
  expect((await reopened.read('workout-2'))?.values.exercise?.reps).toBe(2);
  const other = await openEntryDraftStore(
    { ...scope, accountId: 'other' },
    database.driver,
  );
  expect(await other.read('workout-0')).toBeNull();
});
it('rolls back failed draft persistence and permits exact retry', async () => {
  const database = fixture();
  const store = await openEntryDraftStore(scope, database.driver);
  const draft = {
    workoutId: 'workout',
    bookingId: 'booking',
    focusExerciseId: null,
    values: {},
  };
  database.setFail(true);
  await expect(store.save(draft)).rejects.toThrow('disk_failed');
  expect(await store.read('workout')).toBeNull();
  database.setFail(false);
  await store.save(draft);
  expect(await store.read('workout')).toEqual(draft);
});

it('keeps offline catalog and conflict versions scoped and separate from the participant draft', async () => {
  const database = fixture();
  const store = await openEntryDraftStore(scope, database.driver);
  const draft = {
    workoutId: 'workout',
    bookingId: 'booking',
    focusExerciseId: null,
    values: {},
  };
  const resources = {
    catalog: [{ id: 'catalog' }],
    conflicts: [
      { id: 'conflict', current: { reps: 0 }, incoming: { reps: 8 } },
    ],
  };
  await store.save(draft);
  await store.saveResources('workout', resources);
  await store.close();
  const reopened = await openEntryDraftStore(scope, database.driver);
  expect(await reopened.read('workout')).toEqual(draft);
  expect(await reopened.readResources('workout')).toEqual(resources);
  expect(await reopened.readResources('another-workout')).toBeNull();
  const other = await openEntryDraftStore(
    { ...scope, workspaceId: 'other' },
    database.driver,
  );
  expect(await other.readResources('workout')).toBeNull();
});

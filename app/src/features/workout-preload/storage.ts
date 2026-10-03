import type { SyncScope } from '../../domain/workout-sync/types';
import type {
  WorkoutPreloadContext,
  WorkoutPreloadStore,
  WorkoutRecovery,
} from '../../domain/workout-preload/types';
import {
  validateWorkoutPreloadContext,
  validateWorkoutRecovery,
} from '../../domain/workout-preload/validation';
import type { SQLiteDriver, SQLiteExecutor } from '../workout-sync/storage';

type Stored = { value_json: string };
export class SQLiteWorkoutPreloadStore implements WorkoutPreloadStore {
  readonly scope: SyncScope;
  private queue: Promise<void> = Promise.resolve();
  private closing = false;
  private closePromise: Promise<void> | null = null;
  constructor(
    scope: SyncScope,
    private readonly database: SQLiteDriver,
  ) {
    this.scope = Object.freeze({ ...scope });
  }
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    if (this.closing)
      return Promise.reject(new Error('Workout preload store closed'));
    const result = this.queue.then(task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private async load(
    database: SQLiteExecutor,
    sessionKey: string,
  ): Promise<WorkoutPreloadContext | null> {
    const row = await database.getFirstAsync<Stored>(
      'SELECT value_json FROM workout_preload_context WHERE account_id = ? AND workspace_id = ? AND session_key = ?',
      this.scope.accountId,
      this.scope.workspaceId,
      sessionKey,
    );
    if (!row) return null;
    const context = validateWorkoutPreloadContext(
      JSON.parse(row.value_json) as unknown,
      this.scope,
    );
    if (context.sessionKey !== sessionKey)
      throw new Error('Invalid cached session');
    return context;
  }
  read(sessionKey: string): Promise<WorkoutPreloadContext | null> {
    return this.serialize(async () => {
      const direct = await this.load(this.database, sessionKey);
      if (direct) return direct;
      const rows = await this.database.getAllAsync<Stored>(
        'SELECT value_json FROM workout_preload_context WHERE account_id = ? AND workspace_id = ?',
        this.scope.accountId,
        this.scope.workspaceId,
      );
      for (const row of rows) {
        const context = validateWorkoutPreloadContext(
          JSON.parse(row.value_json) as unknown,
          this.scope,
        );
        if (context.participants.some((item) => item.bookingId === sessionKey))
          return context;
      }
      return null;
    });
  }
  save(
    context: WorkoutPreloadContext,
    recovery?: WorkoutRecovery,
  ): Promise<void> {
    const snapshot = validateWorkoutPreloadContext(
      JSON.parse(JSON.stringify(context)) as unknown,
      this.scope,
    );
    const selection =
      recovery === undefined
        ? undefined
        : validateWorkoutRecovery(
            JSON.parse(JSON.stringify(recovery)) as unknown,
          );
    if (
      selection &&
      (selection.sessionKey !== snapshot.sessionKey ||
        !snapshot.participants.some(
          (item) =>
            item.bookingId === selection.bookingId &&
            item.clientRecordId === selection.clientRecordId,
        ))
    )
      throw new Error('Unknown workout recovery participant');
    return this.serialize(() =>
      this.database.withExclusiveTransactionAsync(async (transaction) => {
        const previous = await this.load(transaction, snapshot.sessionKey);
        if (previous)
          snapshot.participants = snapshot.participants.map((incoming) => {
            const cached = previous.participants.find(
              (item) =>
                item.bookingId === incoming.bookingId &&
                item.clientRecordId === incoming.clientRecordId &&
                item.programId === incoming.programId,
            );
            const assignedExercises = cached?.assignedExercises.map(
              (exercise) => {
                const fresh = incoming.assignedExercises.find(
                  (item) =>
                    item.exerciseId === exercise.exerciseId &&
                    item.measure === exercise.measure,
                );
                return fresh
                  ? { ...exercise, previousSets: fresh.previousSets }
                  : exercise;
              },
            );
            return cached && incoming.workoutStatus === 'not_created'
              ? {
                  ...cached,
                  clientName: incoming.clientName,
                  assignedExercises:
                    assignedExercises ?? cached.assignedExercises,
                  exercises: cached.exercises.map((exercise) => {
                    const fresh = incoming.exercises.find(
                      (item) =>
                        item.exerciseId === exercise.exerciseId &&
                        item.measure === exercise.measure,
                    );
                    return fresh
                      ? { ...exercise, previousSets: fresh.previousSets }
                      : exercise;
                  }),
                }
              : cached
                ? {
                    ...incoming,
                    assignedExercises:
                      assignedExercises ?? cached.assignedExercises,
                    programName: cached.programName,
                    programDescription: cached.programDescription,
                    programRevision: cached.programRevision,
                    baseTemplateId: cached.baseTemplateId,
                  }
                : incoming;
          });
        validateWorkoutPreloadContext(snapshot, this.scope);
        if (!selection) {
          const row = await transaction.getFirstAsync<Stored>(
            'SELECT value_json FROM workout_preload_recovery WHERE account_id = ? AND workspace_id = ?',
            this.scope.accountId,
            this.scope.workspaceId,
          );
          if (row) {
            const retained = validateWorkoutRecovery(
              JSON.parse(row.value_json) as unknown,
            );
            if (
              retained.sessionKey === snapshot.sessionKey &&
              !snapshot.participants.some(
                (item) =>
                  item.bookingId === retained.bookingId &&
                  item.clientRecordId === retained.clientRecordId,
              )
            )
              throw new Error('Refresh would invalidate workout recovery');
          }
        }
        await transaction.runAsync(
          'INSERT INTO workout_preload_context (account_id, workspace_id, session_key, value_json) VALUES (?, ?, ?, ?) ON CONFLICT(account_id, workspace_id, session_key) DO UPDATE SET value_json = excluded.value_json',
          this.scope.accountId,
          this.scope.workspaceId,
          snapshot.sessionKey,
          JSON.stringify(snapshot),
        );
        if (selection)
          await transaction.runAsync(
            'INSERT INTO workout_preload_recovery (account_id, workspace_id, value_json) VALUES (?, ?, ?) ON CONFLICT(account_id, workspace_id) DO UPDATE SET value_json = excluded.value_json',
            this.scope.accountId,
            this.scope.workspaceId,
            JSON.stringify(selection),
          );
      }),
    );
  }
  readRecovery(): Promise<WorkoutRecovery | null> {
    return this.serialize(async () => {
      const row = await this.database.getFirstAsync<Stored>(
        'SELECT value_json FROM workout_preload_recovery WHERE account_id = ? AND workspace_id = ?',
        this.scope.accountId,
        this.scope.workspaceId,
      );
      if (!row) return null;
      const recovery = validateWorkoutRecovery(
        JSON.parse(row.value_json) as unknown,
      );
      await this.checkRecovery(this.database, recovery);
      return recovery;
    });
  }
  private async checkRecovery(
    database: SQLiteExecutor,
    recovery: WorkoutRecovery,
  ): Promise<void> {
    const context = await this.load(database, recovery.sessionKey);
    if (
      !context?.participants.some(
        (item) =>
          item.bookingId === recovery.bookingId &&
          item.clientRecordId === recovery.clientRecordId,
      )
    )
      throw new Error('Unknown workout recovery participant');
  }
  saveRecovery(recovery: WorkoutRecovery): Promise<void> {
    const snapshot = validateWorkoutRecovery(
      JSON.parse(JSON.stringify(recovery)) as unknown,
    );
    return this.serialize(() =>
      this.database.withExclusiveTransactionAsync(async (transaction) => {
        await this.checkRecovery(transaction, snapshot);
        await transaction.runAsync(
          'INSERT INTO workout_preload_recovery (account_id, workspace_id, value_json) VALUES (?, ?, ?) ON CONFLICT(account_id, workspace_id) DO UPDATE SET value_json = excluded.value_json',
          this.scope.accountId,
          this.scope.workspaceId,
          JSON.stringify(snapshot),
        );
      }),
    );
  }
  close(): Promise<void> {
    if (!this.closePromise) {
      this.closing = true;
      this.closePromise = this.queue.then(() => this.database.closeAsync());
    }
    return this.closePromise;
  }
}
export async function openWorkoutPreloadStore(
  scope: SyncScope,
  driver?: SQLiteDriver,
): Promise<SQLiteWorkoutPreloadStore> {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (![scope.accountId, scope.workspaceId].every((value) => uuid.test(value)))
    throw new Error('Invalid preload scope');
  const database =
    driver ??
    (await (
      await import('expo-sqlite')
    ).openDatabaseAsync('workout-preload.db', { useNewConnection: true }));
  try {
    await database.execAsync(`PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS workout_preload_context (account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, session_key TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY (account_id, workspace_id, session_key));
CREATE TABLE IF NOT EXISTS workout_preload_recovery (account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY (account_id, workspace_id));`);
    return new SQLiteWorkoutPreloadStore(scope, database);
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}

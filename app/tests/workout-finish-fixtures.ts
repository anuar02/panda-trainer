import type { EntryDraft, EntryDraftStore } from '@/domain/workout-entry';
import type { PreloadParticipant } from '@/domain/workout-preload/types';
import { WorkoutEntryService } from '@/features/workout-entry/service';
import { openOutboxStore } from '@/features/workout-sync/storage';
import type {
  SQLiteDriver,
  SQLiteExecutor,
  SQLiteParameter,
} from '@/features/workout-sync/storage';
import { session } from './workout-sync-fixtures';
import type { SyncSession } from '@/domain/workout-sync/types';
import { TransactionalFixture } from './workout-sync-sqlite-fixture';

export function finishParticipant(index = 0): PreloadParticipant {
  return {
    bookingId: `finish-booking-${index}`,
    workoutId: `finish-workout-${index}`,
    clientRecordId: `finish-client-${index}`,
    clientName: `Synthetic ${index}`,
    programId: 'program',
    programName: '',
    programDescription: '',
    baseTemplateId: 'template',
    programRevision: 1,
    workoutRevision: 7,
    workoutStatus: 'in_progress',
    assignedExercises: [],
    exercises: [
      {
        id: `finish-exercise-${index}`,
        exerciseId: 'catalog',
        name: 'Exercise',
        measure: 'reps',
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
      },
    ],
  };
}
export function finishSnapshotDriver(
  sqlite: TransactionalFixture,
): SQLiteDriver {
  const database = sqlite.connect();
  const snapshotExecutor = (executor: SQLiteExecutor): SQLiteExecutor => ({
    ...executor,
    getFirstAsync: async <T>(
      sql: string,
      ...p: SQLiteParameter[]
    ): Promise<T | null> => {
      if (sql.startsWith('SELECT COUNT(*)')) {
        const count = sql.includes('FROM workout_outbox')
          ? sqlite.rows.filter(
              (r) => r.account === p[0] && r.workspace === p[1],
            ).length
          : [...sqlite.entries.keys()].filter((key) => {
              const scope = JSON.parse(key) as string[];
              return scope[0] === p[0] && scope[1] === p[1];
            }).length;
        return { count } as T;
      }
      return executor.getFirstAsync<T>(sql, ...p);
    },
    getAllAsync: async <T>(
      sql: string,
      ...p: SQLiteParameter[]
    ): Promise<T[]> => {
      if (sql.includes('OFFSET ?')) {
        const rows = sql.includes('FROM workout_outbox')
          ? sqlite.rows
              .filter((r) => r.account === p[0] && r.workspace === p[1])
              .map((r) => ({
                account_id: r.account,
                workspace_id: r.workspace,
                operation_id: r.id,
                entity_id: (
                  JSON.parse(r.operation_json) as { entity_id: string }
                ).entity_id,
                operation_json: r.operation_json,
                sequence: r.sequence,
                result_json: r.result_json,
                confirmed: r.confirmed,
              }))
          : [...sqlite.entries.entries()]
              .flatMap(([key, value]) => {
                const scope = JSON.parse(key) as string[];
                return scope[0] === p[0] && scope[1] === p[1]
                  ? [
                      {
                        account_id: scope[0],
                        workspace_id: scope[1],
                        entity_id: scope[2],
                        value_json: value,
                      },
                    ]
                  : [];
              })
              .sort((a, b) => (a.entity_id! < b.entity_id! ? -1 : 1));
        const offset = Number(p[3]);
        return rows.slice(offset, offset + Number(p[2])) as T[];
      }
      return executor.getAllAsync<T>(sql, ...p);
    },
  });
  return {
    ...snapshotExecutor(database),
    closeAsync: database.closeAsync,
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) =>
        task(snapshotExecutor(transaction)),
      ),
  };
}
export async function finishSetup() {
  const sqlite = new TransactionalFixture();
  const outbox = await openOutboxStore(session, finishSnapshotDriver(sqlite));
  const records = new Map<string, EntryDraft>();
  const drafts: EntryDraftStore = {
    scope: session,
    read: async (id) => records.get(id) ?? null,
    save: async (draft) => {
      records.set(draft.workoutId, structuredClone(draft));
    },
    close: async () => {},
  };
  let current: SyncSession | null = session;
  let sequence = 0;
  const options = {
    session,
    getSession: () => current,
    outbox,
    drafts,
    deviceId: 'finish-phone',
    newId: () => `finish-id-${++sequence}`,
    now: () => '2026-10-04T10:00:00Z',
  };
  return {
    sqlite,
    outbox,
    drafts,
    options,
    service: new WorkoutEntryService(options),
    changeSession: (next: SyncSession | null) => {
      current = next;
    },
  };
}

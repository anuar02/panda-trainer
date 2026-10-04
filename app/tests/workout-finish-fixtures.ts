import type { EntryDraft, EntryDraftStore } from '@/domain/workout-entry';
import type { PreloadParticipant } from '@/domain/workout-preload/types';
import { WorkoutEntryService } from '@/features/workout-entry/service';
import { openOutboxStore } from '@/features/workout-sync/storage';
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
export async function finishSetup() {
  const sqlite = new TransactionalFixture();
  const outbox = await openOutboxStore(session, sqlite.connect());
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

import { randomUUID } from 'expo-crypto';
import type {
  PreloadExercise,
  PreloadSet,
  WorkoutPreloadReader,
} from '@/domain/workout-preload/types';

export class WorkoutPreloadReadError extends Error {
  constructor(
    readonly code:
      'invalidInput' | 'unavailable' | 'request' | 'network' | 'configuration',
  ) {
    super('Workout preload could not be loaded');
    this.name = 'WorkoutPreloadReadError';
  }
}
type Row = Record<string, unknown>;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const integer = (v: unknown, min = 0, max = 2147483647): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const nullableInteger = (v: unknown): v is number | null =>
  v === null || integer(v);
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;
const timestamp = (v: unknown): v is string =>
  text(v) && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
const plan = (v: unknown): v is string | null =>
  v === null ||
  (typeof v === 'string' && /^[0-9]{1,4}([–-][0-9]{1,4})?$/.test(v));
const fail = (): never => {
  throw new WorkoutPreloadReadError('request');
};
const unavailable = (): never => {
  throw new WorkoutPreloadReadError('unavailable');
};
const exerciseColumns =
  'id,workspace_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,source_key_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds';
export function createWorkoutPreloadReader(
  options: {
    url?: string;
    anonKey?: string;
    fetch?: typeof fetch;
    createId?: () => string;
    now?: () => Date;
  } = {},
): WorkoutPreloadReader {
  const request = options.fetch ?? fetch;
  const url = options.url ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = options.anonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const createId = options.createId ?? randomUUID;
  return {
    async load(session, bookingId, signal) {
      if (
        !uuid(session.accountId) ||
        !uuid(session.workspaceId) ||
        !uuid(bookingId) ||
        !text(session.accessToken) ||
        !text(session.sessionId)
      )
        throw new WorkoutPreloadReadError('invalidInput');
      if (!url || !anonKey) throw new WorkoutPreloadReadError('configuration');
      const accessToken = session.accessToken;
      const accountId = session.accountId.toLowerCase();
      const workspaceId = session.workspaceId.toLowerCase();
      bookingId = bookingId.toLowerCase();
      const checkAbort = () => {
        if (signal.aborted) throw new WorkoutPreloadReadError('unavailable');
      };
      async function rows(
        table: string,
        columns: string,
        filters: Record<string, string>,
        order = 'id.asc',
      ) {
        const result: Row[] = [];
        const ids = new Set<string>();
        for (let offset = 0; offset < 10000; offset += 500) {
          checkAbort();
          const params = new URLSearchParams({
            select: columns,
            ...filters,
            order,
            offset: String(offset),
            limit: '500',
          });
          let response: Response;
          try {
            response = await request(
              `${url.replace(/\/$/, '')}/rest/v1/${table}?${params}`,
              {
                headers: {
                  apikey: anonKey,
                  Authorization: `Bearer ${accessToken}`,
                },
                signal,
              },
            );
          } catch {
            checkAbort();
            throw new WorkoutPreloadReadError('network');
          }
          checkAbort();
          if (!response.ok) {
            if (
              response.status >= 500 ||
              response.status === 408 ||
              response.status === 429
            )
              throw new WorkoutPreloadReadError('network');
            if (response.status === 401 || response.status === 403)
              return unavailable();
            return fail();
          }
          let data: unknown;
          try {
            data = await response.json();
          } catch {
            return fail();
          }
          checkAbort();
          if (!Array.isArray(data) || data.length > 500) return fail();
          for (const value of data) {
            if (
              typeof value !== 'object' ||
              value === null ||
              Array.isArray(value)
            )
              return fail();
            const row = value as Row;
            if (
              !uuid(row.id) ||
              ids.has(row.id) ||
              (table !== 'trainer_workspaces' &&
                row.workspace_id !== workspaceId)
            )
              return fail();
            ids.add(row.id);
            result.push(row);
          }
          if (data.length < 500) return result;
        }
        return fail();
      }
      const scoped = { workspace_id: `eq.${workspaceId}` };
      const owners = await rows('trainer_workspaces', 'id,owner_user_id', {
        id: `eq.${workspaceId}`,
        owner_user_id: `eq.${accountId}`,
      });
      if (
        owners.length !== 1 ||
        !owners[0] ||
        owners[0].id !== workspaceId ||
        owners[0].owner_user_id !== accountId
      )
        return unavailable();
      const bookingColumns =
        'id,workspace_id,client_record_id,group_session_id,starts_at,ends_at,status,revision';
      const selected = await rows('bookings', bookingColumns, {
        ...scoped,
        id: `eq.${bookingId}`,
      });
      if (selected.length !== 1 || !selected[0] || selected[0].id !== bookingId)
        return unavailable();
      const selectedBooking = selected[0];
      if (!selectedBooking) return unavailable();
      if (
        !timestamp(selectedBooking.starts_at) ||
        !timestamp(selectedBooking.ends_at)
      )
        return fail();
      const startsAt = selectedBooking.starts_at;
      const endsAt = selectedBooking.ends_at;
      if (Date.parse(endsAt) <= Date.parse(startsAt)) return fail();
      const groupId = selectedBooking.group_session_id;
      if (groupId !== null && !uuid(groupId)) return fail();
      let bookings = selected;
      if (groupId !== null) {
        const groups = await rows(
          'group_sessions',
          'id,workspace_id,starts_at,ends_at',
          { ...scoped, id: `eq.${groupId}` },
        );
        if (
          groups.length !== 1 ||
          !groups[0] ||
          groups[0].id !== groupId ||
          !timestamp(groups[0].starts_at) ||
          !timestamp(groups[0].ends_at)
        )
          return unavailable();
        bookings = await rows('bookings', bookingColumns, {
          ...scoped,
          group_session_id: `eq.${groupId}`,
          starts_at: `eq.${startsAt}`,
          ends_at: `eq.${endsAt}`,
        });
        if (!bookings.some((b) => b.id === bookingId)) return unavailable();
      }
      const participants = [];
      const clients = new Set<string>();
      for (const booking of bookings) {
        if (
          booking.group_session_id !== groupId ||
          booking.starts_at !== startsAt ||
          booking.ends_at !== endsAt ||
          !uuid(booking.client_record_id) ||
          !integer(booking.revision, 1)
        )
          return fail();
        if (
          booking.status === 'cancelled_by_client' ||
          booking.status === 'cancelled_by_trainer'
        ) {
          if (booking.id === bookingId) return unavailable();
          continue;
        }
        if (booking.status !== 'proposed' && booking.status !== 'confirmed')
          return fail();
        const clientId = booking.client_record_id;
        if (clients.has(clientId)) return fail();
        clients.add(clientId);
        const cards = await rows(
          'client_records',
          'id,workspace_id,display_name,archived_at',
          { ...scoped, id: `eq.${clientId}` },
        );
        if (
          cards.length !== 1 ||
          !cards[0] ||
          cards[0].id !== clientId ||
          cards[0].archived_at !== null
        )
          return unavailable();
        const card = cards[0];
        if (!card || !text(card.display_name)) return fail();
        const programs = await rows(
          'booking_programs',
          'id,workspace_id,booking_id,name,description,base_template_id,base_template_revision',
          { ...scoped, booking_id: `eq.${booking.id}` },
        );
        if (programs.length !== 1) return unavailable();
        const program = programs[0];
        if (!program) return unavailable();
        if (
          program.booking_id !== booking.id ||
          !text(program.name) ||
          typeof program.description !== 'string' ||
          !uuid(program.base_template_id) ||
          !integer(program.base_template_revision, 1)
        )
          return fail();
        const instances = await rows(
          'workout_instances',
          'id,workspace_id,booking_id,client_record_id,started_at,finished_at,revision',
          { ...scoped, client_record_id: `eq.${clientId}` },
          'started_at.desc,id.asc',
        );
        for (const item of instances)
          if (
            item.client_record_id !== clientId ||
            !uuid(item.booking_id) ||
            !timestamp(item.started_at) ||
            (item.finished_at !== null &&
              (!timestamp(item.finished_at) ||
                Date.parse(item.finished_at) < Date.parse(item.started_at))) ||
            !integer(item.revision, 1)
          )
            return fail();
        const current = instances.filter(
          (item) => item.booking_id === booking.id,
        );
        if (current.length > 1) return fail();
        async function exercises(
          table: 'workout_exercises' | 'booking_program_exercises',
          parentId: string,
        ) {
          const parent =
            table === 'workout_exercises'
              ? 'workout_instance_id'
              : 'booking_program_id';
          const data = await rows(
            table,
            `${exerciseColumns},${parent}${table === 'workout_exercises' ? ',revision,skipped,replaced_from_id' : ''}`,
            { ...scoped, [parent]: `eq.${parentId}` },
            'position.asc,id.asc',
          );
          const positions = new Set<number>();
          const result: PreloadExercise[] = [];
          for (const row of data) {
            if (
              row[parent] !== parentId ||
              !uuid(row.exercise_id) ||
              !text(row.exercise_name_snapshot) ||
              typeof row.bodyweight_snapshot !== 'boolean' ||
              typeof row.muscle_group_snapshot !== 'string' ||
              typeof row.equipment_snapshot !== 'string' ||
              !Array.isArray(row.instructions_snapshot) ||
              !row.instructions_snapshot.every(
                (value) => typeof value === 'string',
              ) ||
              (row.source_key_snapshot !== null &&
                typeof row.source_key_snapshot !== 'string') ||
              (table === 'workout_exercises' &&
                (typeof row.skipped !== 'boolean' ||
                  (row.replaced_from_id !== null &&
                    !uuid(row.replaced_from_id)))) ||
              (row.measure_snapshot !== 'reps' &&
                row.measure_snapshot !== 'seconds') ||
              !integer(row.position) ||
              positions.has(row.position) ||
              !integer(row.planned_sets) ||
              !plan(row.planned_reps) ||
              !plan(row.planned_seconds) ||
              !nullableInteger(row.planned_weight_g) ||
              (row.planned_weight_g !== null &&
                row.planned_weight_g > 1000000) ||
              !integer(row.rest_seconds, 0, 600) ||
              (row.measure_snapshot === 'reps'
                ? row.planned_seconds !== null
                : row.planned_reps !== null) ||
              (table === 'workout_exercises' && !integer(row.revision, 1))
            )
              return fail();
            positions.add(row.position);
            const id =
              table === 'workout_exercises' ? (row.id as string) : createId();
            if (!uuid(id)) return fail();
            result.push({
              id,
              exerciseId: row.exercise_id,
              name: row.exercise_name_snapshot,
              measure: row.measure_snapshot,
              bodyweight: row.bodyweight_snapshot,
              muscleGroup: row.muscle_group_snapshot,
              equipment: row.equipment_snapshot,
              instructions: [...row.instructions_snapshot] as string[],
              sourceKey: row.source_key_snapshot as string | null,
              skipped:
                table === 'workout_exercises'
                  ? (row.skipped as boolean)
                  : false,
              replacedFromId:
                table === 'workout_exercises'
                  ? (row.replaced_from_id as string | null)
                  : null,
              position: row.position,
              plannedSets: row.planned_sets,
              plannedReps: row.planned_reps,
              plannedSeconds: row.planned_seconds,
              plannedWeightGrams: row.planned_weight_g,
              restSeconds: row.rest_seconds,
              revision:
                table === 'workout_exercises' ? (row.revision as number) : 0,
              sets: [],
              previousSets: [],
            });
          }
          if (table === 'workout_exercises') {
            for (const line of result)
              if (
                line.replacedFromId !== null &&
                (line.replacedFromId === line.id ||
                  !result.some((parent) => parent.id === line.replacedFromId))
              )
                return fail();
            const sets = await rows(
              'set_results',
              'id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,seconds,weight_g,revision,deleted_at',
              {
                ...scoped,
                workout_instance_id: `eq.${parentId}`,
                deleted_at: 'is.null',
              },
              'position.asc,id.asc',
            );
            for (const row of sets) {
              const exercise = result.find(
                (item) => item.id === row.workout_exercise_id,
              );
              if (
                row.workout_instance_id !== parentId ||
                !exercise ||
                row.deleted_at !== null ||
                !integer(row.position) ||
                !integer(row.revision, 1) ||
                !nullableInteger(row.reps) ||
                !nullableInteger(row.seconds) ||
                !nullableInteger(row.weight_g) ||
                (exercise.measure === 'reps'
                  ? row.seconds !== null
                  : row.reps !== null) ||
                exercise.sets.some((s) => s.position === row.position)
              )
                return fail();
              const set: PreloadSet = {
                id: row.id as string,
                position: row.position,
                revision: row.revision,
                reps: row.reps,
                seconds: row.seconds,
                weightGrams: row.weight_g,
              };
              exercise.sets.push(set);
            }
          }
          return result;
        }
        const assignedExercises = await exercises(
          'booking_program_exercises',
          program.id as string,
        );
        if (!assignedExercises.length) return unavailable();
        const currentWorkout = current[0];
        const lines = currentWorkout
          ? await exercises('workout_exercises', currentWorkout!.id as string)
          : assignedExercises;
        const historyLines = currentWorkout
          ? [...assignedExercises, ...lines]
          : lines;
        const unresolved = new Set(historyLines.map((line) => line.exerciseId));
        const history = instances
          .filter(
            (item) =>
              item.booking_id !== booking.id &&
              timestamp(item.finished_at) &&
              Date.parse(item.finished_at) < Date.parse(startsAt),
          )
          .sort(
            (a, b) =>
              Date.parse(b.finished_at as string) -
                Date.parse(a.finished_at as string) ||
              (a.id as string).localeCompare(b.id as string),
          );
        for (const past of history) {
          if (!unresolved.size) break;
          for (const old of await exercises(
            'workout_exercises',
            past.id as string,
          )) {
            if (
              !unresolved.has(old.exerciseId) ||
              !old.sets.length ||
              !historyLines.some(
                (line) =>
                  line.exerciseId === old.exerciseId &&
                  line.measure === old.measure,
              )
            )
              continue;
            for (const line of historyLines)
              if (
                line.exerciseId === old.exerciseId &&
                line.measure === old.measure
              )
                line.previousSets = old.sets;
            unresolved.delete(old.exerciseId);
          }
        }
        const workoutId = current.length
          ? (currentWorkout!.id as string)
          : createId();
        if (!uuid(workoutId)) return fail();
        participants.push({
          bookingId: booking.id as string,
          clientRecordId: clientId,
          clientName: card.display_name,
          programId: program.id as string,
          programName: program.name,
          programDescription: program.description,
          baseTemplateId: program.base_template_id,
          programRevision: program.base_template_revision,
          workoutId,
          workoutRevision: current.length
            ? (currentWorkout!.revision as number)
            : 0,
          workoutStatus: current.length
            ? currentWorkout!.finished_at === null
              ? ('in_progress' as const)
              : ('finished' as const)
            : ('not_created' as const),
          exercises: lines,
          assignedExercises,
        });
      }
      checkAbort();
      if (!participants.length) return unavailable();
      return {
        version: 1,
        scope: { accountId, workspaceId },
        sessionKey:
          groupId === null
            ? bookingId
            : `${groupId}:${new Date(startsAt).toISOString()}:${new Date(endsAt).toISOString()}`,
        startsAt: new Date(startsAt).toISOString(),
        loadedAt: (options.now?.() ?? new Date()).toISOString(),
        participants,
      };
    },
  };
}

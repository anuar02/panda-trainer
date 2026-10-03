import { getSupabaseClient } from '@/features/auth/client';
import type { ClientScheduleContext } from '../client-scheduling/service';

export type ClientHistorySet = {
  id: string;
  position: number;
  reps: number | null;
  seconds: number | null;
  weightG: number | null;
  revision: number;
};
export type ClientHistoryExercise = {
  id: string;
  exerciseId: string;
  name: string;
  measure: 'reps' | 'seconds';
  bodyweight: boolean;
  muscleGroup: string;
  equipment: string;
  instructions: string[];
  position: number;
  plannedSets: number;
  plannedReps: string | null;
  plannedSeconds: string | null;
  plannedWeightG: number | null;
  restSeconds: number;
  replacedFromId: string | null;
  skipped: boolean;
  revision: number;
  sets: ClientHistorySet[];
};
export type ClientHistoryJournal = {
  id: string;
  bookingId: string;
  startedAtUtc: string;
  finishedAtUtc: string;
  revision: number;
  exercises: ClientHistoryExercise[];
  notes: {
    id: string;
    text: string;
    revision: number;
    createdAtUtc: string;
    updatedAtUtc: string;
  }[];
};
export type ClientHistory = {
  context: ClientScheduleContext;
  journals: ClientHistoryJournal[];
  nextOffset: number | null;
};
export class ClientHistoryError extends Error {
  constructor(
    readonly code: 'invalidInput' | 'configuration' | 'unavailable' | 'request',
  ) {
    super('Client history could not be loaded');
    this.name = 'ClientHistoryError';
  }
}
const fail = (): never => {
  throw new ClientHistoryError('request');
};
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown, min = 0, max = 2147483647): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const text = (v: unknown): v is string => typeof v === 'string';
const nullableText = (v: unknown): v is string | null => v === null || text(v);
const nullableNumber = (v: unknown, max = 2147483647): v is number | null =>
  v === null || integer(v, 0, max);
const timestamp = (v: unknown): v is string =>
  text(v) &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v));
const columns = {
  workout_instances:
    'id,workspace_id,booking_id,client_record_id,started_at,finished_at,revision',
  workout_exercises:
    'id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,replaced_from_id,skipped,revision',
  set_results:
    'id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,seconds,weight_g,revision,deleted_at',
  session_notes:
    'id,workspace_id,workout_instance_id,text,revision,created_at,updated_at',
} as const;
type Table = keyof typeof columns;
export type ClientHistorySession = {
  valid(): boolean;
  dispose(): void;
};
type SessionState = {
  userId: string;
  token: string | null;
  active: boolean;
  client: NonNullable<ReturnType<typeof getSupabaseClient>>;
};
const sessions = new WeakMap<ClientHistorySession, SessionState>();
export function openClientHistorySession(
  userId: string,
  onInvalidated: () => void = () => {},
): ClientHistorySession {
  const client = getSupabaseClient();
  if (!client) throw new ClientHistoryError('configuration');
  const state: SessionState = {
    userId: userId.toLowerCase(),
    token: null,
    active: true,
    client,
  };
  let disposed = false;
  const invalidate = () => {
    if (!state.active) return;
    state.active = false;
    if (state.token !== null) onInvalidated();
  };
  const subscription = client.auth.onAuthStateChange((event, session) => {
    if (disposed) return;
    if (!state.active) {
      if (
        session?.access_token &&
        session.user.id.toLowerCase() === state.userId
      )
        onInvalidated();
      return;
    }
    if (
      !session?.access_token ||
      session.user.id.toLowerCase() !== state.userId
    ) {
      invalidate();
      return;
    }
    if (
      state.token !== null &&
      session.access_token !== state.token &&
      event !== 'TOKEN_REFRESHED'
    ) {
      invalidate();
      return;
    }
    state.token = session.access_token;
  }).data.subscription;
  const fence: ClientHistorySession = {
    valid: () => state.active,
    dispose: () => {
      disposed = true;
      state.active = false;
      subscription.unsubscribe();
    },
  };
  sessions.set(fence, state);
  return fence;
}
async function historyToken(
  fence: ClientHistorySession,
  userId: string,
): Promise<string> {
  const state = sessions.get(fence);
  if (!state?.active || state.userId !== userId.toLowerCase())
    throw new ClientHistoryError('unavailable');
  const current = await state.client.auth.getSession();
  const session = current.data.session;
  if (
    !state.active ||
    current.error ||
    !session?.access_token ||
    session.user.id.toLowerCase() !== state.userId ||
    (state.token !== null && session.access_token !== state.token)
  ) {
    state.active = false;
    throw new ClientHistoryError('unavailable');
  }
  state.token = session.access_token;
  return state.token;
}
export async function loadClientHistory(input: {
  expectedUserId: string;
  session?: ClientHistorySession;
  workspaceId?: string;
  clientRecordId: string;
  startsAtUtc?: string;
  endsAtUtc?: string;
  offset?: number;
  limit?: number;
}): Promise<ClientHistory> {
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 50;
  const { startsAtUtc, endsAtUtc } = input;
  const bounded = startsAtUtc !== undefined || endsAtUtc !== undefined;
  if (
    !uuid(input.expectedUserId) ||
    !uuid(input.clientRecordId) ||
    (input.workspaceId !== undefined && !uuid(input.workspaceId)) ||
    (bounded &&
      (!timestamp(startsAtUtc) ||
        !timestamp(endsAtUtc) ||
        Date.parse(endsAtUtc) <= Date.parse(startsAtUtc) ||
        Date.parse(endsAtUtc) - Date.parse(startsAtUtc) > 366 * 86400000)) ||
    !integer(offset, 0, 100000) ||
    !integer(limit, 1, 100)
  )
    throw new ClientHistoryError('invalidInput');
  const client = getSupabaseClient();
  if (!client) throw new ClientHistoryError('configuration');
  const fence = input.session ?? openClientHistorySession(input.expectedUserId);
  try {
    let token = await historyToken(fence, input.expectedUserId);
    const result = await client
      .rpc('get_my_client_schedule_context', {
        p_client_record_id: input.clientRecordId.toLowerCase(),
      })
      .setHeader('Authorization', `Bearer ${token}`);
    token = await historyToken(fence, input.expectedUserId);
    const row: unknown = result.data;
    if (result.error) throw new ClientHistoryError('unavailable');
    if (
      !object(row) ||
      Object.keys(row).sort().join(',') !==
        'client_name,client_record_id,timezone,trainer_name,workspace_id' ||
      row.client_record_id !== input.clientRecordId.toLowerCase() ||
      !uuid(row.workspace_id) ||
      (input.workspaceId !== undefined &&
        row.workspace_id !== input.workspaceId.toLowerCase()) ||
      !text(row.timezone) ||
      !text(row.client_name) ||
      !text(row.trainer_name)
    )
      return fail();
    try {
      new Intl.DateTimeFormat('en', { timeZone: row.timezone }).format();
    } catch {
      return fail();
    }
    const context: ClientScheduleContext = {
      clientRecordId: row.client_record_id as string,
      workspaceId: row.workspace_id,
      timezone: row.timezone,
      clientName: row.client_name,
      trainerName: row.trainer_name,
    };
    const query = (table: Table) =>
      client
        .from(table)
        .select(columns[table])
        .eq('workspace_id', context.workspaceId)
        .setHeader('Authorization', `Bearer ${token}`);
    let instanceQuery = client
      .from('workout_instances')
      .select(columns.workout_instances)
      .eq('workspace_id', context.workspaceId)
      .setHeader('Authorization', `Bearer ${token}`)
      .eq('client_record_id', context.clientRecordId)
      .not('finished_at', 'is', null);
    if (startsAtUtc !== undefined && endsAtUtc !== undefined)
      instanceQuery = instanceQuery
        .gte('finished_at', startsAtUtc)
        .lt('finished_at', endsAtUtc);
    const instances = await instanceQuery
      .order('finished_at', { ascending: false })
      .order('id')
      .range(offset, offset + limit);
    await historyToken(fence, input.expectedUserId);
    if (
      instances.error ||
      !Array.isArray(instances.data) ||
      instances.data.length > limit + 1
    )
      return fail();
    const journals = new Map<string, ClientHistoryJournal>();
    const all = instances.data as unknown[];
    for (const item of all) {
      if (
        !object(item) ||
        !uuid(item.id) ||
        journals.has(item.id) ||
        item.workspace_id !== context.workspaceId ||
        item.client_record_id !== context.clientRecordId ||
        !uuid(item.booking_id) ||
        !timestamp(item.started_at) ||
        !timestamp(item.finished_at) ||
        Date.parse(item.finished_at) < Date.parse(item.started_at) ||
        (startsAtUtc !== undefined &&
          Date.parse(item.finished_at) < Date.parse(startsAtUtc)) ||
        (endsAtUtc !== undefined &&
          Date.parse(item.finished_at) >= Date.parse(endsAtUtc)) ||
        !integer(item.revision, 1)
      )
        return fail();
      journals.set(item.id, {
        id: item.id,
        bookingId: item.booking_id,
        startedAtUtc: new Date(item.started_at).toISOString(),
        finishedAtUtc: new Date(item.finished_at).toISOString(),
        revision: item.revision,
        exercises: [],
        notes: [],
      });
    }
    const nextOffset = journals.size > limit ? offset + limit : null;
    const selected = [...journals.values()]
      .sort(
        (a, b) =>
          Date.parse(b.finishedAtUtc) - Date.parse(a.finishedAtUtc) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit);
    const selectedIds = selected.map((journal) => journal.id);
    const selectedMap = new Map(
      selected.map((journal) => [journal.id, journal]),
    );
    async function children(table: Exclude<Table, 'workout_instances'>) {
      if (!selectedIds.length) return [];
      const rows: Record<string, unknown>[] = [];
      for (let start = 0; start < 10000; start += 500) {
        const childToken = await historyToken(fence, input.expectedUserId);
        let request = query(table)
          .setHeader('Authorization', `Bearer ${childToken}`)
          .in('workout_instance_id', selectedIds)
          .order('id')
          .range(start, start + 499);
        if (table === 'set_results') request = request.is('deleted_at', null);
        const response = await request;
        await historyToken(fence, input.expectedUserId);
        if (
          response.error ||
          !Array.isArray(response.data) ||
          response.data.length > 500
        )
          return fail();
        for (const value of response.data as unknown[]) {
          if (
            !object(value) ||
            value.workspace_id !== context.workspaceId ||
            !uuid(value.id) ||
            !uuid(value.workout_instance_id) ||
            !selectedMap.has(value.workout_instance_id) ||
            rows.some((item) => item.id === value.id)
          )
            return fail();
          rows.push(value);
        }
        if (response.data.length < 500) return rows;
      }
      return fail();
    }
    const exercises = new Map<string, ClientHistoryExercise>();
    for (const value of await children('workout_exercises')) {
      if (
        !uuid(value.exercise_id) ||
        !text(value.exercise_name_snapshot) ||
        !value.exercise_name_snapshot.trim() ||
        (value.measure_snapshot !== 'reps' &&
          value.measure_snapshot !== 'seconds') ||
        typeof value.bodyweight_snapshot !== 'boolean' ||
        !text(value.muscle_group_snapshot) ||
        !text(value.equipment_snapshot) ||
        !Array.isArray(value.instructions_snapshot) ||
        !value.instructions_snapshot.every(text) ||
        !integer(value.position) ||
        !integer(value.planned_sets) ||
        !nullableText(value.planned_reps) ||
        !nullableText(value.planned_seconds) ||
        (value.planned_reps !== null &&
          (!text(value.planned_reps) ||
            !/^[0-9]{1,3}([–-][0-9]{1,3})?$/.test(value.planned_reps))) ||
        (value.planned_seconds !== null &&
          (!text(value.planned_seconds) ||
            !/^[0-9]{1,4}([–-][0-9]{1,4})?$/.test(value.planned_seconds))) ||
        !nullableNumber(value.planned_weight_g, 1000000) ||
        !integer(value.rest_seconds, 0, 600) ||
        (value.replaced_from_id !== null && !uuid(value.replaced_from_id)) ||
        typeof value.skipped !== 'boolean' ||
        !integer(value.revision, 1) ||
        (value.measure_snapshot === 'reps'
          ? value.planned_seconds !== null
          : value.planned_reps !== null)
      )
        return fail();
      const journal = selectedMap.get(value.workout_instance_id as string)!;
      if (journal.exercises.some((item) => item.position === value.position))
        return fail();
      const exercise: ClientHistoryExercise = {
        id: value.id as string,
        exerciseId: value.exercise_id,
        name: value.exercise_name_snapshot,
        measure: value.measure_snapshot,
        bodyweight: value.bodyweight_snapshot,
        muscleGroup: value.muscle_group_snapshot,
        equipment: value.equipment_snapshot,
        instructions: [...value.instructions_snapshot],
        position: value.position,
        plannedSets: value.planned_sets,
        plannedReps: value.planned_reps,
        plannedSeconds: value.planned_seconds,
        plannedWeightG: value.planned_weight_g,
        restSeconds: value.rest_seconds,
        replacedFromId: value.replaced_from_id as string | null,
        skipped: value.skipped,
        revision: value.revision,
        sets: [],
      };
      exercises.set(exercise.id, exercise);
      journal.exercises.push(exercise);
    }
    for (const journal of selected)
      for (const exercise of journal.exercises) {
        if (
          exercise.replacedFromId &&
          !journal.exercises.some(
            (item) =>
              item.id === exercise.replacedFromId && item.id !== exercise.id,
          )
        )
          return fail();
      }
    for (const value of await children('set_results')) {
      const journal = selectedMap.get(value.workout_instance_id as string)!;
      const exercise = uuid(value.workout_exercise_id)
        ? exercises.get(value.workout_exercise_id)
        : null;
      if (
        !exercise ||
        !journal.exercises.includes(exercise) ||
        value.deleted_at !== null ||
        !integer(value.position) ||
        !nullableNumber(value.reps) ||
        !nullableNumber(value.seconds) ||
        !nullableNumber(value.weight_g) ||
        !integer(value.revision, 1) ||
        (exercise.measure === 'reps'
          ? value.seconds !== null
          : value.reps !== null) ||
        exercise.sets.some((item) => item.position === value.position)
      )
        return fail();
      exercise.sets.push({
        id: value.id as string,
        position: value.position,
        reps: value.reps,
        seconds: value.seconds,
        weightG: value.weight_g,
        revision: value.revision,
      });
    }
    for (const value of await children('session_notes')) {
      if (
        !text(value.text) ||
        !integer(value.revision, 1) ||
        !timestamp(value.created_at) ||
        !timestamp(value.updated_at) ||
        Date.parse(value.updated_at) < Date.parse(value.created_at)
      )
        return fail();
      selectedMap.get(value.workout_instance_id as string)!.notes.push({
        id: value.id as string,
        text: value.text,
        revision: value.revision,
        createdAtUtc: new Date(value.created_at).toISOString(),
        updatedAtUtc: new Date(value.updated_at).toISOString(),
      });
    }
    for (const journal of selected) {
      journal.exercises.sort((a, b) => a.position - b.position);
      journal.exercises.forEach((exercise) =>
        exercise.sets.sort((a, b) => a.position - b.position),
      );
      journal.notes.sort(
        (a, b) =>
          Date.parse(a.createdAtUtc) - Date.parse(b.createdAtUtc) ||
          a.id.localeCompare(b.id),
      );
    }
    await historyToken(fence, input.expectedUserId);
    return { context, journals: selected, nextOffset };
  } catch (error: unknown) {
    if (error instanceof ClientHistoryError) throw error;
    throw new ClientHistoryError('request');
  } finally {
    if (!input.session) fence.dispose();
  }
}

import type {
  Session,
  AuthChangeEvent,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';
import { clientReadToken } from './client-read-auth-fixture';
export const user = 'f1360000-0000-4000-8000-000000000001';
export const workspace = 'f1360000-0000-4000-8000-000000000010';
export const card = 'f1360000-0000-4000-8000-000000000020';
export const bookingId = 'f1360000-0000-4000-8000-000000000030';
export const journalId = 'f1360000-0000-4000-8000-000000000040';
export const exerciseId = 'f1360000-0000-4000-8000-000000000050';
export const context = {
  client_record_id: card,
  workspace_id: workspace,
  timezone: 'UTC',
  client_name: 'Synthetic client',
  trainer_name: 'Synthetic trainer',
};
export const scope = {
  expectedUserId: user,
  workspaceId: workspace,
  clientRecordId: card,
  startsOn: '2026-09-28',
  endsOn: '2026-10-05',
};
export const props = {
  userId: user,
  workspaceId: workspace,
  clientRecordId: card,
  clientName: 'Synthetic client',
  trainerName: 'Synthetic trainer',
};
export function clientNetwork() {
  let session = {
    access_token: clientReadToken(user),
    user: { id: user },
  } as Session;
  const listeners = new Set<
    (event: AuthChangeEvent, session: Session | null) => void
  >();
  const calls: {
    table: string;
    args: Record<string, unknown>;
    header: string;
    offset: number;
  }[] = [];
  const booking: Record<string, unknown> = {
    id: bookingId,
    workspace_id: workspace,
    client_record_id: card,
    group_session_id: null,
    starts_at: '2030-10-06T10:00:00Z',
    ends_at: '2030-10-06T11:00:00Z',
    status: 'confirmed',
    revision: 1,
  };
  const tables: Record<string, Record<string, unknown>[]> = {
    bookings: [booking],
    booking_programs: [],
    booking_program_exercises: [],
    workout_instances: [
      {
        id: journalId,
        workspace_id: workspace,
        client_record_id: card,
        booking_id: bookingId,
        started_at: '2020-01-01T10:00:00Z',
        finished_at: '2020-01-01T11:00:00Z',
        revision: 1,
      },
    ],
    workout_exercises: [
      {
        id: exerciseId,
        workspace_id: workspace,
        workout_instance_id: journalId,
        exercise_id: 'f1360000-0000-4000-8000-000000000051',
        exercise_name_snapshot: 'Synthetic squat',
        measure_snapshot: 'reps',
        bodyweight_snapshot: false,
        muscle_group_snapshot: 'Legs',
        equipment_snapshot: 'Barbell',
        instructions_snapshot: [],
        position: 0,
        planned_sets: 3,
        planned_reps: '8',
        planned_seconds: null,
        planned_weight_g: 50000,
        rest_seconds: 60,
        replaced_from_id: null,
        skipped: false,
        revision: 1,
      },
    ],
    set_results: [
      {
        id: 'f1360000-0000-4000-8000-000000000060',
        workspace_id: workspace,
        workout_instance_id: journalId,
        workout_exercise_id: exerciseId,
        position: 0,
        reps: 8,
        seconds: null,
        weight_g: 50501,
        revision: 1,
        deleted_at: null,
      },
      {
        id: 'f1360000-0000-4000-8000-000000000061',
        workspace_id: workspace,
        workout_instance_id: journalId,
        workout_exercise_id: exerciseId,
        position: 1,
        reps: 0,
        seconds: null,
        weight_g: 0,
        revision: 1,
        deleted_at: null,
      },
      {
        id: 'f1360000-0000-4000-8000-000000000062',
        workspace_id: workspace,
        workout_instance_id: journalId,
        workout_exercise_id: exerciseId,
        position: 2,
        reps: null,
        seconds: null,
        weight_g: null,
        revision: 1,
        deleted_at: null,
      },
    ],
    session_notes: [
      {
        id: 'f1360000-0000-4000-8000-000000000070',
        workspace_id: workspace,
        workout_instance_id: journalId,
        text: 'Shared pre-registration note',
        revision: 1,
        created_at: '2020-01-01T10:00:00Z',
        updated_at: '2020-01-01T10:00:00Z',
      },
    ],
  };
  let linked = true;
  let overview: Record<string, unknown> = {
    context,
    today: '2026-10-04',
    remaining_units: '6',
    active_units: '8',
    due_minor: '9007199254740993',
    visits: [{ date: '2026-10-01', count: '1' }],
  };
  let intercept: (
    table: string,
    offset: number,
  ) => Promise<void> = async () => {};
  let commandHandler: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { code: string } | null;
  }> = async () => ({ data: null, error: { code: 'P0002' } });
  const query = (table: string, args: Record<string, unknown> = {}) => {
    const call = { table, args, header: '', offset: 0 };
    calls.push(call);
    let end = 499;
    let single = false;
    const filters: [string, string, unknown][] = [];
    const builder = {
      select: () => builder,
      abortSignal: () => builder,
      eq: (key: string, value: unknown) => {
        filters.push(['eq', key, value]);
        return builder;
      },
      in: (key: string, value: unknown[]) => {
        filters.push(['in', key, value]);
        return builder;
      },
      not: (key: string) => {
        filters.push(['not', key, null]);
        return builder;
      },
      is: (key: string, value: unknown) => {
        filters.push(['eq', key, value]);
        return builder;
      },
      gt: () => builder,
      lt: () => builder,
      gte: () => builder,
      order: () => builder,
      maybeSingle: () => {
        single = true;
        return builder;
      },
      range: (start: number, last: number) => {
        call.offset = start;
        end = last;
        return builder;
      },
      setHeader: (_key: string, header: string) => {
        call.header = header;
        return builder;
      },
      then: (
        resolve: (value: {
          data: unknown;
          error: { code: string } | null;
        }) => unknown,
        reject: (error: unknown) => unknown,
      ) =>
        (async () => {
          await intercept(table, call.offset);
          if (table === 'accept_invitation') {
            linked = true;
            return {
              data: {
                accepted: true,
                client_record_id: card,
                trainer_name: context.trainer_name,
                accepted_at: '2026-10-04T12:00:00Z',
                replayed: false,
              },
              error: null,
            };
          }
          if (!linked) return { data: null, error: { code: 'P0002' } };
          if (table === 'get_my_client_schedule_context')
            return { data: context, error: null };
          if (table === 'get_my_client_schedule_proposals')
            return {
              data: (tables.schedule_proposals ?? [])
                .filter((row) => row.status === 'pending')
                .slice(
                  Number(args.p_offset),
                  Number(args.p_offset) + Number(args.p_limit),
                ),
              error: null,
            };
          if (table === 'get_my_client_overview')
            return {
              data: {
                ...overview,
                starts_on: args.p_starts_on,
                ends_on: args.p_ends_on,
                visits: Array.isArray(overview.visits)
                  ? overview.visits.filter(
                      (v) =>
                        typeof v === 'object' &&
                        v !== null &&
                        'date' in v &&
                        String(v.date) >= String(args.p_starts_on) &&
                        String(v.date) < String(args.p_ends_on),
                    )
                  : overview.visits,
              },
              error: null,
            };
          if (!(table in tables)) return commandHandler(table, args);
          const rows = (tables[table] ?? []).filter((row) =>
            filters.every(([op, key, value]) =>
              op === 'eq'
                ? row[key] === value
                : op === 'not'
                  ? row[key] !== null
                  : Array.isArray(value) && value.includes(row[key]),
            ),
          );
          return {
            data: single ? (rows[0] ?? null) : rows.slice(call.offset, end + 1),
            error: null,
          };
        })().then(resolve, reject),
    };
    return builder;
  };
  const auth = {
    getUser: jest.fn(async () => ({
      data: { user: session.user },
      error: null,
    })),
    getSession: jest.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: (
      listener: (event: AuthChangeEvent, session: Session | null) => void,
    ) => {
      listeners.add(listener);
      return {
        data: {
          subscription: { unsubscribe: () => listeners.delete(listener) },
        },
      };
    },
  };
  return {
    client: {
      auth,
      from: (table: string) => query(table),
      rpc: query,
    } as unknown as SupabaseClient<Database>,
    tables,
    calls,
    auth,
    setCommandHandler: (handler: typeof commandHandler) => {
      commandHandler = handler;
    },
    setLinked: (value: boolean) => {
      linked = value;
    },
    setOverview: (value: Record<string, unknown>) => {
      overview = value;
    },
    overview: () => overview,
    intercept: (value: typeof intercept) => {
      intercept = value;
    },
    emit: (event: AuthChangeEvent, next = session) => {
      session = next;
      for (const listener of [...listeners]) listener(event, next);
    },
    session: () => session,
    listenerCount: () => listeners.size,
  };
}

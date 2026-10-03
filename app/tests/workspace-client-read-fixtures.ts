import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getSupabaseClient } from '@/features/auth/client';

export const workspaceId = '61000000-0000-4000-8000-000000000001';
export const clientId = '71000000-0000-4000-8000-000000000001';
export const userId = '81000000-0000-4000-8000-000000000001';
export const id = (n: number) =>
  `91000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const dates = {
  revision: 1,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
};
export const person = {
  ...dates,
  id: clientId,
  workspace_id: workspaceId,
  display_name: 'Real synthetic client',
  user_id: null,
  phone: '',
  archived_at: null,
};
export const program = {
  ...dates,
  id: id(1),
  workspace_id: workspaceId,
  client_record_id: clientId,
  base_template_id: id(2),
  base_template_revision: 3,
  name: 'Immutable plan',
  description: 'Original description',
};
export const exercise = {
  ...dates,
  id: id(3),
  workspace_id: workspaceId,
  client_program_id: program.id,
  exercise_id: id(4),
  exercise_name_snapshot: 'Original exercise',
  source_key_snapshot: null,
  measure_snapshot: 'seconds',
  bodyweight_snapshot: true,
  muscle_group_snapshot: 'core',
  equipment_snapshot: 'none',
  instructions_snapshot: ['Original instruction'],
  position: 0,
  planned_sets: 3,
  planned_reps: null,
  planned_seconds: '30–45',
  planned_weight_g: 0,
  rest_seconds: 45,
  note: 'Public plan note',
};
export const booking = {
  ...dates,
  id: id(5),
  workspace_id: workspaceId,
  client_record_id: clientId,
  group_session_id: null,
  starts_at: '2099-10-01T10:00:00Z',
  ends_at: '2099-10-01T11:00:00Z',
  status: 'confirmed',
};
export type QueryState = {
  table: string;
  columns: string;
  filters: Record<string, unknown>;
  orders: [string, boolean][];
  offset: number;
  end: number;
  single: boolean;
  token: string;
  signal?: AbortSignal;
};
export type Response = { data: unknown; error: unknown; count: number | null };
export function setupRead(
  tables: Record<string, unknown[]> = {},
  intercept?: (
    state: QueryState,
    response: Response,
  ) => Response | Promise<Response>,
) {
  let session = {
    user: { id: userId },
    access_token: 'original-token',
  } as Session | null;
  const listeners = new Set<
    (event: AuthChangeEvent, session: Session | null) => void
  >();
  const queries: QueryState[] = [];
  const unsubscribe = jest.fn();
  const data = {
    trainer_workspaces: [{ id: workspaceId, owner_user_id: userId }],
    client_records: [person],
    client_programs: [program],
    bookings: [booking],
    client_program_exercises: [exercise],
    ...tables,
  };
  const from = jest.fn((table: string) => {
    const state: QueryState = {
      table,
      columns: '',
      filters: {},
      orders: [],
      offset: 0,
      end: 0,
      single: false,
      token: '',
    };
    const query = {
      select(columns: string) {
        state.columns = columns;
        return query;
      },
      eq(column: string, value: unknown) {
        state.filters[column] = value;
        return query;
      },
      filter(column: string, _operator: string, value: unknown) {
        state.filters[column] = value;
        return query;
      },
      in(column: string, value: unknown) {
        state.filters[column] = value;
        return query;
      },
      gte(column: string, value: unknown) {
        state.filters[column] = value;
        return query;
      },
      order(column: string, options: { ascending: boolean }) {
        state.orders.push([column, options.ascending]);
        return query;
      },
      range(offset: number, end: number) {
        state.offset = offset;
        state.end = end;
        return query;
      },
      setHeader(_name: string, value: string) {
        state.token = value;
        return query;
      },
      abortSignal(signal: AbortSignal) {
        state.signal = signal;
        return query;
      },
      maybeSingle() {
        state.single = true;
        return query;
      },
      then(
        resolve: (response: Response) => unknown,
        reject: (reason: unknown) => unknown,
      ) {
        queries.push(state);
        const source = data[table as keyof typeof data] ?? [];
        const response: Response = {
          data: state.single
            ? (source[0] ?? null)
            : source.slice(state.offset, state.end + 1),
          count: state.single ? null : source.length,
          error: null,
        };
        return Promise.resolve(
          intercept ? intercept(state, response) : response,
        ).then(resolve, reject);
      },
    };
    return query;
  });
  const auth = {
    getSession: jest.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: jest.fn(
      (listener: (event: AuthChangeEvent, session: Session | null) => void) => {
        listeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                listeners.delete(listener);
                unsubscribe();
              },
            },
          },
        };
      },
    ),
  };
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue({ from, auth } as unknown as SupabaseClient<Database>);
  return {
    from,
    auth,
    queries,
    unsubscribe,
    setSession: (next: Session | null) => {
      session = next;
    },
    emit: (event: AuthChangeEvent, next: Session | null) => {
      session = next;
      for (const listener of listeners) listener(event, next);
    },
    session: (token = 'original-token', actor = userId) =>
      ({ user: { id: actor }, access_token: token }) as Session,
  };
}

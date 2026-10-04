import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getSupabaseClient } from '@/features/auth/client';

export const actor = '81000000-0000-4000-8000-000000000001';
export const workspaceId = '61000000-0000-4000-8000-000000000001';
export const cardId = '71000000-0000-4000-8000-000000000001';
export const loginId = '91000000-0000-4000-8000-000000000001';
export const anotherLogin = '91000000-0000-4000-8000-000000000002';
export function session(
  sessionId = loginId,
  userId = actor,
  nonce = 'a',
): Session {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, session_id: sessionId }),
  ).toString('base64url');
  return {
    user: { id: userId },
    access_token: `header.${payload}.${nonce}`,
  } as Session;
}
export const audit = {
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  revision: 1,
  created_by: actor,
};
export const profile = {
  ...audit,
  user_id: actor,
  display_name: 'Synthetic trainer',
  locale: 'ru',
};
export const workspace = {
  ...audit,
  id: workspaceId,
  owner_user_id: actor,
  name: 'Synthetic studio',
  timezone: 'Asia/Almaty',
  training_focus: ['strength'],
  working_days: [0, 1, 2, 3, 4, 5],
  day_start: '07:00:00',
  day_end: '21:00:00',
  usual_session_minutes: 60,
};
export const card = {
  ...audit,
  id: cardId,
  workspace_id: workspaceId,
  user_id: actor,
  display_name: 'Synthetic client',
  phone: null,
  archived_at: null,
};
export const connection = {
  client_record_id: cardId,
  workspace_id: workspaceId,
  trainer_name: 'Synthetic studio',
  client_name: card.display_name,
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export type Io = {
  label: string;
  token?: string;
  filters?: Record<string, unknown>;
  args?: unknown;
};
export function setupOnboarding(
  options: {
    first?: boolean;
    connections?: boolean;
    honorFilters?: boolean;
    io?: (io: Io) => Promise<void> | void;
  } = {},
) {
  let active: Session | null = session();
  const listeners = new Set<
    (event: AuthChangeEvent, next: Session | null) => void
  >();
  const calls: Io[] = [];
  const tables: Record<string, unknown[]> = {
    profiles: options.first ? [] : [profile],
    trainer_workspaces: options.first ? [] : [workspace],
    client_records: options.connections ? [card] : [],
  };
  let connections: unknown = options.connections ? [connection] : [];
  let rpcResult: unknown = undefined;
  let failure: unknown = null;
  let countOverride: number | undefined;
  let creations = 0;
  const io = async (call: Io) => {
    calls.push(call);
    await options.io?.(call);
  };
  const query = (label: string, args?: unknown) => {
    const filters: Record<string, unknown> = {};
    let token = '';
    let single = false;
    let offset = 0;
    let end = 199;
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => {
        filters[key] = value;
        return builder;
      },
      is: (key: string, value: unknown) => {
        filters[key] = value;
        return builder;
      },
      order: () => builder,
      in: () => builder,
      gte: () => builder,
      range: (start: number, stop: number) => {
        offset = start;
        end = stop;
        return builder;
      },
      setHeader: (_key: string, value: string) => {
        token = value;
        return builder;
      },
      abortSignal: () => builder,
      maybeSingle: () => {
        single = true;
        return builder;
      },
      then: (
        yes: (value: unknown) => unknown,
        no: (reason: unknown) => unknown,
      ) =>
        (async () => {
          await io({ label, token, filters, args });
          if (label === 'complete_trainer_onboarding') {
            if (!tables.trainer_workspaces?.length) {
              tables.profiles = [profile];
              tables.trainer_workspaces = [workspace];
              creations++;
              if (options.honorFilters) {
                const input = args as Record<string, unknown>;
                if (input.first_client_name)
                  tables.client_records = [
                    {
                      ...card,
                      user_id: null,
                      display_name: input.first_client_name,
                      phone: input.first_client_phone ?? null,
                    },
                  ];
              }
            }
            return {
              data:
                rpcResult === undefined
                  ? tables.trainer_workspaces?.[0]
                  : rpcResult,
              error: failure,
            };
          }
          if (label === 'list_my_client_connections')
            return { data: connections, error: failure };
          const source = tables[label] ?? [];
          const data = options.honorFilters
            ? source.filter((value) => {
                const row = value as Record<string, unknown>;
                return Object.entries(filters).every(
                  ([key, expected]) => row[key] === expected,
                );
              })
            : source;
          return {
            data: single ? (data[0] ?? null) : data.slice(offset, end + 1),
            count: countOverride ?? data.length,
            error: failure,
          };
        })().then(yes, no),
    };
    return builder;
  };
  const auth = {
    getSession: jest.fn(async () => {
      const snapshot = active;
      await io({ label: 'getSession' });
      return { data: { session: snapshot }, error: null };
    }),
    getUser: jest.fn(async (token: string) => {
      const snapshot = active?.user;
      await io({ label: 'getUser', token });
      return { data: { user: snapshot ?? null }, error: null };
    }),
    onAuthStateChange: (
      listener: (event: AuthChangeEvent, next: Session | null) => void,
    ) => {
      listeners.add(listener);
      return {
        data: {
          subscription: { unsubscribe: () => listeners.delete(listener) },
        },
      };
    },
  };
  const client = {
    auth,
    from: (table: string) => query(table),
    rpc: (name: string, args?: unknown) => query(name, args),
  } as unknown as SupabaseClient<Database>;
  jest.mocked(getSupabaseClient).mockReturnValue(client);
  return {
    client,
    auth,
    tables,
    calls,
    emit: (event: AuthChangeEvent, next: Session | null) => {
      active = next;
      for (const listener of [...listeners]) listener(event, next);
    },
    setSession: (next: Session | null) => {
      active = next;
    },
    setConnections: (next: unknown) => {
      connections = next;
    },
    setResult: (next: unknown) => {
      rpcResult = next;
    },
    setFailure: (next: unknown) => {
      failure = next;
    },
    setCount: (next: number) => {
      countOverride = next;
    },
    creations: () => creations,
    subscriptions: () => listeners.size,
  };
}

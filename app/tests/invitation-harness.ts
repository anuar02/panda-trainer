import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';
import type { InvitationScope } from '../src/features/invitations/session';

export const actor = '30000000-0000-4000-8000-000000000001';
export const workspace = '40000000-0000-4000-8000-000000000001';
export const cardId = '20000000-0000-4000-8000-000000000001';
export const invitationId = '10000000-0000-4000-8000-000000000001';
export const secret = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
export const jwt = (user = actor, session = invitationId, extra = '') =>
  `header.${Buffer.from(JSON.stringify({ sub: user, session_id: session, extra })).toString('base64url')}.signature`;
export const session = (user = actor, id = invitationId, extra = '') => ({
  user: { id: user },
  access_token: jwt(user, id, extra),
});
export const scope: InvitationScope = {
  userId: actor,
  token: jwt(),
  workspaceId: workspace,
  clientRecordId: cardId,
};
export const accepted = {
  accepted: true,
  client_record_id: cardId,
  trainer_name: 'Тренер А',
  accepted_at: '2026-10-01T12:00:00.000Z',
  replayed: false,
};
export const issued = {
  invitation_id: invitationId,
  expires_at: '2026-10-08T12:00:00.000Z',
  active: true,
  replayed: false,
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function harness(
  rpc = jest.fn().mockResolvedValue({ data: accepted, error: null }),
) {
  let current: ReturnType<typeof session> | null = session();
  const listeners = new Set<(event: string, next: typeof current) => void>();
  const headers: { source: string; name: string; value: string }[] = [];
  const queries: { source: string; calls: [string, unknown[]][] }[] = [];
  const card = {
    id: cardId,
    workspace_id: workspace,
    user_id: null,
    display_name: 'Карточка',
    phone: null,
    archived_at: null,
    revision: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };
  const invitation = {
    id: invitationId,
    client_record_id: cardId,
    expires_at: issued.expires_at,
    accepted_at: null,
    revoked_at: null,
  };
  const read = jest.fn(
    async (source: string): Promise<{ data: unknown; error: unknown }> => ({
      data:
        source === 'trainer_workspaces'
          ? { id: workspace, owner_user_id: actor }
          : source === 'client_records'
            ? card
            : invitation,
      error: null,
    }),
  );
  const builder = (source: string, execute: () => Promise<unknown>) => {
    const query = { source, calls: [] as [string, unknown[]][] };
    queries.push(query);
    const chain: Record<string, unknown> = {};
    for (const method of [
      'select',
      'eq',
      'is',
      'order',
      'limit',
      'abortSignal',
      'range',
    ])
      chain[method] = (...args: unknown[]) => {
        query.calls.push([method, args]);
        return chain;
      };
    chain.setHeader = (name: string, value: string) => {
      headers.push({ source, name, value });
      return chain;
    };
    chain.maybeSingle = () => chain;
    chain.then = (
      yes: (value: unknown) => unknown,
      no: (error: unknown) => unknown,
    ) => execute().then(yes, no);
    return chain;
  };
  const getSession = jest.fn(async () => ({
    data: { session: current },
    error: null,
  }));
  const getUser = jest.fn(async () => ({
    data: { user: current?.user ?? null },
    error: null,
  }));
  const client = {
    auth: {
      getSession,
      getUser,
      onAuthStateChange: (
        listener: (event: string, next: typeof current) => void,
      ) => {
        listeners.add(listener);
        return {
          data: {
            subscription: { unsubscribe: () => listeners.delete(listener) },
          },
        };
      },
    },
    from: (source: string) => builder(source, () => read(source)),
    rpc: (name: string, args: unknown) => builder(name, () => rpc(name, args)),
  } as unknown as SupabaseClient<Database>;
  return {
    client,
    rpc,
    read,
    headers,
    queries,
    getSession,
    getUser,
    card,
    invitation,
    listeners,
    setSession: (next: typeof current) => {
      current = next;
    },
    event: (event: string, next: typeof current) => {
      current = next;
      for (const listener of listeners) listener(event, next);
    },
  };
}

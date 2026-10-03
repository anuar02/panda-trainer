import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getSupabaseClient } from '@/features/auth/client';
import {
  loadClientHistory,
  openClientHistorySession,
} from '@/features/client-history/service';
import { useClientHistory } from '@/features/client-history/use-history';
import type { Database } from '@/lib/database.types';

jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
}));
const user = '11000000-0000-4000-8000-000000000001';
const card = '31000000-0000-4000-8000-000000000001';
const workspace = '21000000-0000-4000-8000-000000000001';
const journal = '41000000-0000-4000-8000-000000000001';
const input = {
  expectedUserId: user,
  clientRecordId: card,
  workspaceId: workspace,
  limit: 1,
};
const scope = {
  userId: user,
  clientRecordId: card,
  workspaceId: workspace,
  limit: 1,
};
const session = (token: string, actor = user) =>
  ({ access_token: token, user: { id: actor } }) as Session;
function setup() {
  let current: Session | null = session('synthetic-a');
  const listeners = new Set<
    (event: AuthChangeEvent, value: Session | null) => void
  >();
  const emit = (event: AuthChangeEvent, value: Session | null) => {
    current = value;
    for (const listener of [...listeners]) listener(event, value);
  };
  let intercept: (
    table: string,
    offset: number,
  ) => Promise<void> = async () => {};
  const calls: { table: string; offset: number; header: string }[] = [];
  const getSession = jest.fn(async () => ({
    data: { session: current },
    error: null,
  }));
  const from = jest.fn((table: string) => {
    const call = { table, offset: 0, header: '' };
    let selectedJournal = journal;
    calls.push(call);
    const builder = {
      select: () => builder,
      eq: () => builder,
      not: () => builder,
      in: (_key: string, ids: string[]) => {
        selectedJournal = ids[0] ?? journal;
        return builder;
      },
      order: () => builder,
      is: () => builder,
      range: (start: number) => {
        call.offset = start;
        return builder;
      },
      setHeader: (_key: string, value: string) => {
        call.header = value;
        return builder;
      },
      then: (
        resolve: (value: unknown) => unknown,
        reject: (error: unknown) => unknown,
      ) =>
        (async () => {
          await intercept(table, call.offset);
          return {
            error: null,
            data:
              table === 'workout_instances'
                ? [0, 1].slice(call.offset).map((position) => ({
                    id: position
                      ? '41000000-0000-4000-8000-000000000002'
                      : journal,
                    booking_id: card,
                    workspace_id: workspace,
                    client_record_id: card,
                    started_at: '2020-01-01T10:00:00Z',
                    finished_at: '2020-01-01T11:00:00Z',
                    revision: 1,
                  }))
                : table === 'session_notes'
                  ? Array.from({ length: 501 }, (_, index) => ({
                      id: `61000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                      workspace_id: workspace,
                      workout_instance_id: selectedJournal,
                      text: 'Public pre-link note',
                      revision: 1,
                      created_at: '2020-01-01T10:00:00Z',
                      updated_at: '2020-01-01T10:00:00Z',
                    })).slice(call.offset, call.offset + 500)
                  : [],
          };
        })().then(resolve, reject),
    };
    return builder;
  });
  const rpc = jest.fn(() => ({
    setHeader: async () => ({
      error: null,
      data: {
        client_record_id: card,
        workspace_id: workspace,
        timezone: 'UTC',
        client_name: 'Synthetic',
        trainer_name: 'Trainer',
      },
    }),
  }));
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession,
      onAuthStateChange: (
        listener: (event: AuthChangeEvent, value: Session | null) => void,
      ) => {
        listeners.add(listener);
        return {
          data: {
            subscription: { unsubscribe: () => listeners.delete(listener) },
          },
        };
      },
    },
    from,
    rpc,
  } as unknown as SupabaseClient<Database>);
  return {
    emit,
    calls,
    getSession,
    from,
    rpc,
    listeners,
    intercept: (value: typeof intercept) => {
      intercept = value;
    },
    replace: (value: Session | null) => {
      current = value;
    },
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => jest.clearAllMocks());

test.each(['SIGNED_IN', 'SIGNED_OUT'] as const)(
  'same-user session change between child pages fails closed: %s',
  async (event) => {
    const api = setup();
    api.intercept(async (table, offset) => {
      if (table === 'session_notes' && offset === 0)
        api.emit(event, event === 'SIGNED_OUT' ? null : session('synthetic-b'));
    });
    await expect(loadClientHistory(input)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(api.calls.some((call) => call.offset === 500)).toBe(false);
    expect(api.listeners.size).toBe(0);
  },
);
test('same-user new token at final check without event rejects the entire snapshot', async () => {
  const api = setup();
  api.getSession.mockImplementationOnce(async () => ({
    data: { session: session('synthetic-a') },
    error: null,
  }));
  api.intercept(async (table, offset) => {
    if (table === 'session_notes' && offset === 500)
      api.replace(session('synthetic-b'));
  });
  await expect(loadClientHistory(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
});
test('refresh continues one fence and subsequent child pages use refreshed bearer without exposing it', async () => {
  const api = setup();
  api.intercept(async (table, offset) => {
    if (table === 'session_notes' && offset === 0)
      api.emit('TOKEN_REFRESHED', session('synthetic-refresh'));
  });
  const result = await loadClientHistory(input);
  expect(result.journals[0]?.notes).toHaveLength(501);
  expect(result.journals[0]?.finishedAtUtc).toBe('2020-01-01T11:00:00.000Z');
  expect(api.calls.at(-1)?.header).toBe('Bearer synthetic-refresh');
  expect(JSON.stringify(result)).not.toContain('synthetic-refresh');
});
test('foreign actor refresh and workspace mismatch cannot authorize history', async () => {
  const api = setup();
  const fence = openClientHistorySession(user);
  api.emit('TOKEN_REFRESHED', session('foreign', card));
  await expect(
    loadClientHistory({ ...input, session: fence }),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(api.rpc).not.toHaveBeenCalled();
  fence.dispose();
  api.replace(session('synthetic-a'));
  await expect(
    loadClientHistory({ ...input, workspaceId: card }),
  ).rejects.toMatchObject({ code: 'request' });
  expect(api.from).not.toHaveBeenCalled();
});
test('loaded history and pending loadMore are discarded on same-user login; retry uses fresh first page', async () => {
  const api = setup();
  const hook = await renderHook(useClientHistory, { initialProps: scope });
  await waitFor(() =>
    expect(hook.result.current.history?.journals).toHaveLength(1),
  );
  const pending = deferred();
  api.intercept(async (table, offset) => {
    if (table === 'workout_instances' && offset === 1) await pending.promise;
  });
  await act(async () => {
    void hook.result.current.loadMore();
  });
  expect(hook.result.current.loadingMore).toBe(true);
  await act(async () => api.emit('SIGNED_IN', session('synthetic-b')));
  await waitFor(() => expect(hook.result.current.loadingMore).toBe(false));
  await act(async () => pending.resolve());
  expect(hook.result.current.history?.journals.map((row) => row.id)).toEqual([
    journal,
  ]);
  await act(async () => hook.result.current.retry());
  await waitFor(() =>
    expect(hook.result.current.history?.journals).toHaveLength(1),
  );
  expect(
    api.calls
      .filter((call) => call.table === 'workout_instances')
      .map((call) => call.offset),
  ).toEqual([0, 1, 0, 0]);
  await hook.unmount();
  expect(api.listeners.size).toBe(0);
});
test('logout clears shown history, login restores first page, refresh preserves history', async () => {
  const api = setup();
  const hook = await renderHook(useClientHistory, { initialProps: scope });
  await waitFor(() => expect(hook.result.current.history).not.toBeNull());
  const before = hook.result.current.history;
  await act(async () =>
    api.emit('TOKEN_REFRESHED', session('synthetic-refresh')),
  );
  expect(hook.result.current.history).toBe(before);
  await act(async () => api.emit('SIGNED_OUT', null));
  await waitFor(() => expect(hook.result.current.error).toBe('unavailable'));
  expect(hook.result.current.history).toBeNull();
  await act(async () => hook.result.current.retryMore());
  expect(hook.result.current.history).toBeNull();
  await act(async () => api.emit('SIGNED_IN', session('synthetic-b')));
  await waitFor(() => expect(hook.result.current.history).not.toBeNull());
  await hook.unmount();
});
test('unmount during initial request prevents late publication and releases subscription', async () => {
  const api = setup();
  const pending = deferred();
  api.intercept(async () => pending.promise);
  const hook = await renderHook(useClientHistory, { initialProps: scope });
  await waitFor(() => expect(api.from).toHaveBeenCalled());
  await hook.unmount();
  await act(async () => pending.resolve());
  expect(api.listeners.size).toBe(0);
  expect(api.calls).toHaveLength(1);
});

test('same-user token replacement precisely at final session check rejects completed pages', async () => {
  const api = setup();
  let count = 0;
  api.getSession.mockImplementation(async () => ({
    data: { session: session(++count === 12 ? 'synthetic-b' : 'synthetic-a') },
    error: null,
  }));
  await expect(loadClientHistory(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect(count).toBe(12);
  expect(api.calls.at(-1)?.offset).toBe(500);
});
test('same-user login during initial read hides old response until the fresh read finishes', async () => {
  const api = setup();
  const old = deferred();
  const fresh = deferred();
  let count = 0;
  api.intercept(async (table) => {
    if (table === 'workout_instances')
      await (++count === 1 ? old.promise : fresh.promise);
  });
  const hook = await renderHook(useClientHistory, { initialProps: scope });
  await waitFor(() => expect(api.from).toHaveBeenCalled());
  await act(async () => api.emit('SIGNED_IN', session('synthetic-b')));
  await waitFor(() => expect(count).toBe(2));
  await act(async () => old.resolve());
  expect(hook.result.current.history).toBeNull();
  expect(hook.result.current.loading).toBe(true);
  await act(async () => fresh.resolve());
  await waitFor(() =>
    expect(hook.result.current.history?.journals).toHaveLength(1),
  );
  await hook.unmount();
});
test('loadMore detects a missed same-user auth event and drops previously shown pages', async () => {
  const api = setup();
  const hook = await renderHook(useClientHistory, { initialProps: scope });
  await waitFor(() => expect(hook.result.current.history).not.toBeNull());
  api.replace(session('synthetic-b'));
  await act(async () => hook.result.current.loadMore());
  expect(hook.result.current.history).toBeNull();
  expect(hook.result.current.error).toBe('unavailable');
  await act(async () => hook.result.current.retry());
  await waitFor(() =>
    expect(hook.result.current.history?.journals).toHaveLength(1),
  );
  await hook.unmount();
});

test('refresh before loadMore and retryMore keeps pages in the original fence', async () => {
  const api = setup();
  const hook = await renderHook(useClientHistory, { initialProps: scope });
  await waitFor(() =>
    expect(hook.result.current.history?.journals).toHaveLength(1),
  );
  api.intercept(async (table, offset) => {
    if (table === 'workout_instances' && offset === 1)
      throw new Error('Synthetic transient failure');
  });
  await act(async () => hook.result.current.loadMore());
  expect(hook.result.current.moreError).toBe('request');
  await act(async () =>
    api.emit('TOKEN_REFRESHED', session('synthetic-refresh')),
  );
  api.intercept(async () => {});
  await act(async () => hook.result.current.retryMore());
  expect(hook.result.current.history?.journals).toHaveLength(2);
  expect(hook.result.current.moreError).toBeNull();
  expect(hook.result.current.generation).toBe(0);
  expect(api.calls.at(-1)?.header).toBe('Bearer synthetic-refresh');
  await hook.unmount();
});

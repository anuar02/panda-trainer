import { clientReadToken } from './client-read-auth-fixture';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getSupabaseClient } from '@/features/auth/client';
import {
  ClientHistoryError,
  loadClientHistory,
  type ClientHistory,
  type ClientHistoryJournal,
} from '@/features/client-history/service';
import { loadClientProgressHistory } from '@/features/client-progress/service';
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('@/features/client-history/service', () => ({
  ...jest.requireActual<typeof import('@/features/client-history/service')>(
    '@/features/client-history/service',
  ),
  loadClientHistory: jest.fn(),
}));
const load = jest.mocked(loadClientHistory);
const user = '11000000-0000-4000-8000-000000000001';
const card = '31000000-0000-4000-8000-000000000001';
const input = { expectedUserId: user, clientRecordId: card };
const context = {
  clientRecordId: card,
  workspaceId: 'workspace',
  timezone: 'UTC',
  clientName: 'Client',
  trainerName: 'Trainer',
};
const journal = (id: string): ClientHistoryJournal => ({
  id,
  bookingId: id,
  startedAtUtc: '2020-01-01T10:00:00Z',
  finishedAtUtc: '2020-01-01T11:00:00Z',
  revision: 1,
  exercises: [],
  notes: [],
});
const page = (ids: string[], nextOffset: number | null): ClientHistory => ({
  context,
  journals: ids.map(journal),
  nextOffset,
});
beforeEach(() => {
  load.mockReset();
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      getSession: jest.fn(async () => ({
        data: {
          session: { access_token: clientReadToken(user), user: { id: user } },
        },
        error: null,
      })),
    },
  } as unknown as SupabaseClient<Database>);
});
test('loads all-time pages before returning complete history', async () => {
  load
    .mockResolvedValueOnce(page(['a'], 100))
    .mockResolvedValueOnce(page(['b'], null));
  const result = await loadClientProgressHistory(input);
  expect(result.journals.map((row) => row.id)).toEqual(['a', 'b']);
  expect(result.nextOffset).toBeNull();
  expect(load.mock.calls.map(([request]) => request)).toEqual([
    { ...input, limit: 100, offset: 0 },
    { ...input, limit: 100, offset: 100 },
  ]);
});
test('empty complete history is valid', async () => {
  load.mockResolvedValue(page([], null));
  expect((await loadClientProgressHistory(input)).journals).toEqual([]);
});
test('page failure rejects whole load without returning partial metrics', async () => {
  load
    .mockResolvedValueOnce(page(['a'], 100))
    .mockRejectedValueOnce(new ClientHistoryError('request'));
  await expect(loadClientProgressHistory(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test.each([
  page(['a'], null),
  { ...page(['b'], null), context: { ...context, workspaceId: 'other' } },
  page(['b'], 100),
])('rejects duplicate, mixed-scope or nonadvancing pages', async (second) => {
  load.mockResolvedValueOnce(page(['a'], 100)).mockResolvedValueOnce(second);
  await expect(loadClientProgressHistory(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test('rejects client record mismatch immediately', async () => {
  load.mockResolvedValue({
    ...page([], null),
    context: { ...context, clientRecordId: user },
  });
  await expect(loadClientProgressHistory(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test('cap refuses incomplete global history', async () => {
  load.mockImplementation(async ({ offset = 0 }) =>
    page(
      Array.from({ length: 100 }, (_, index) => `${offset + index}`),
      offset + 100,
    ),
  );
  await expect(loadClientProgressHistory(input)).rejects.toMatchObject({
    code: 'request',
  });
  expect(load).toHaveBeenCalledTimes(100);
});
test('cap allows exactly10000 complete journals', async () => {
  load.mockImplementation(async ({ offset = 0 }) =>
    page(
      Array.from({ length: 100 }, (_, index) => `${offset + index}`),
      offset === 9900 ? null : offset + 100,
    ),
  );
  expect((await loadClientProgressHistory(input)).journals).toHaveLength(10000);
});
test('final account check rejects account switch after last page', async () => {
  load.mockResolvedValue(page(['a'], null));
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      getSession: jest.fn(async () => ({
        data: {
          session: { access_token: clientReadToken(user), user: { id: card } },
        },
        error: null,
      })),
    },
  } as unknown as SupabaseClient<Database>);
  await expect(loadClientProgressHistory(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
});
test('per-page unavailable error retains its meaning', async () => {
  load.mockRejectedValue(new ClientHistoryError('unavailable'));
  await expect(loadClientProgressHistory(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
});

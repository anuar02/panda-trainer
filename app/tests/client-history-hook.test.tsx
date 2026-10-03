import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useClientHistory } from '../src/features/client-history/use-history';
import {
  ClientHistoryError,
  loadClientHistory,
  type ClientHistory,
  type ClientHistoryJournal,
} from '../src/features/client-history/service';

let mockFocused = true;
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));
jest.mock('../src/features/client-history/service', () => {
  const actual = jest.requireActual<
    typeof import('../src/features/client-history/service')
  >('../src/features/client-history/service');
  return {
    ...actual,
    loadClientHistory: jest.fn(),
    openClientHistorySession: jest.fn(() => ({
      valid: () => true,
      dispose: jest.fn(),
    })),
  };
});
const load = jest.mocked(loadClientHistory);
const scope = {
  userId: 'user-a',
  clientRecordId: 'card-a',
  startsAtUtc: '2026-01-01T00:00:00.000Z',
  endsAtUtc: '2026-10-01T00:00:00.000Z',
  limit: 1,
};
const journal = (id: string, finishedAtUtc: string): ClientHistoryJournal => ({
  id,
  bookingId: `booking-${id}`,
  startedAtUtc: finishedAtUtc,
  finishedAtUtc,
  revision: 1,
  exercises: [],
  notes: [],
});
const first: ClientHistory = {
  context: {
    clientRecordId: 'card-a',
    workspaceId: 'workspace-a',
    timezone: 'Asia/Almaty',
    clientName: 'Client',
    trainerName: 'Trainer',
  },
  journals: [journal('journal-a', '2026-09-02T00:00:00.000Z')],
  nextOffset: 1,
};
const second: ClientHistory = {
  ...first,
  journals: [journal('journal-b', '2026-09-01T00:00:00.000Z')],
  nextOffset: null,
};
const deferred = () => {
  let resolve!: (value: ClientHistory) => void;
  const promise = new Promise<ClientHistory>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const mount = () => renderHook(useClientHistory, { initialProps: scope });

beforeEach(() => {
  mockFocused = true;
  load.mockReset().mockResolvedValue(first);
});

test('loads scoped first page and serializes pagination while preserving visible results', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.history).toEqual(first));
  expect(load).toHaveBeenCalledWith({
    expectedUserId: scope.userId,
    session: expect.objectContaining({ valid: expect.any(Function) }),
    workspaceId: undefined,
    clientRecordId: scope.clientRecordId,
    startsAtUtc: scope.startsAtUtc,
    endsAtUtc: scope.endsAtUtc,
    limit: 1,
    offset: 0,
  });
  const pending = deferred();
  load.mockReturnValueOnce(pending.promise);
  await act(async () => {
    void hook.result.current.loadMore();
    void hook.result.current.loadMore();
  });
  expect(load).toHaveBeenCalledTimes(2);
  expect(load.mock.calls[1]?.[0].offset).toBe(1);
  expect(hook.result.current.history).toEqual(first);
  expect(hook.result.current.loadingMore).toBe(true);
  await act(async () => pending.resolve(second));
  expect(hook.result.current.history?.journals.map((item) => item.id)).toEqual([
    'journal-a',
    'journal-b',
  ]);
  expect(hook.result.current.hasMore).toBe(false);
  await act(async () => hook.result.current.loadMore());
  expect(load).toHaveBeenCalledTimes(2);
});

for (const change of [
  { userId: 'user-b' },
  { clientRecordId: 'card-b' },
  { startsAtUtc: '2026-02-01T00:00:00.000Z' },
]) {
  test(`scope change ${JSON.stringify(change)} hides old history and discards old pagination`, async () => {
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.history).toEqual(first));
    const more = deferred();
    const next = deferred();
    load.mockReturnValueOnce(more.promise).mockReturnValueOnce(next.promise);
    await act(async () => {
      void hook.result.current.loadMore();
    });
    await hook.rerender({ ...scope, ...change });
    expect(hook.result.current.history).toBeNull();
    await act(async () => more.resolve(second));
    expect(hook.result.current.history).toBeNull();
    await act(async () => next.resolve({ ...first, nextOffset: null }));
    expect(hook.result.current.history?.journals).toEqual(first.journals);
    expect(hook.result.current.loadingMore).toBe(false);
  });
}

test('blur ignores late initial data and refocus starts a fresh first page', async () => {
  const pending = deferred();
  load.mockReturnValueOnce(pending.promise);
  const hook = await mount();
  mockFocused = false;
  await hook.rerender(scope);
  await act(async () => pending.resolve(first));
  expect(hook.result.current.history).toBeNull();
  mockFocused = true;
  await hook.rerender(scope);
  await waitFor(() => expect(hook.result.current.history).toEqual(first));
  expect(load).toHaveBeenCalledTimes(2);
});

test('initial and pagination errors retry independently without dropping successful pages', async () => {
  load.mockRejectedValueOnce(new ClientHistoryError('unavailable'));
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.error).toBe('unavailable'));
  await act(async () => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.history).toEqual(first));
  load.mockRejectedValueOnce(new Error('connection lost'));
  await act(async () => hook.result.current.loadMore());
  expect(hook.result.current.history).toEqual(first);
  expect(hook.result.current.error).toBeNull();
  expect(hook.result.current.moreError).toBe('request');
  load.mockResolvedValueOnce(second);
  await act(async () => hook.result.current.retryMore());
  expect(hook.result.current.moreError).toBeNull();
  expect(load.mock.calls.at(-1)?.[0].offset).toBe(1);
});

for (const page of [
  { ...second, journals: first.journals },
  { ...second, context: { ...second.context, workspaceId: 'workspace-other' } },
  { ...second, nextOffset: 1 },
]) {
  test('rejects incompatible or duplicate pages without mixing history', async () => {
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.history).toEqual(first));
    load.mockResolvedValueOnce(page);
    await act(async () => hook.result.current.loadMore());
    expect(hook.result.current.history).toEqual(first);
    expect(hook.result.current.moreError).toBe('request');
  });
}

test('all-time scope passes omitted bounds through initial and pagination reads', async () => {
  load
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce({ ...first, journals: [], nextOffset: null });
  const { result } = await renderHook(useClientHistory, {
    initialProps: {
      userId: scope.userId,
      clientRecordId: scope.clientRecordId,
      limit: 1,
    },
  });
  await waitFor(() => expect(result.current.history).toEqual(first));
  await act(async () => result.current.loadMore());
  expect(
    load.mock.calls.map(([input]) => [
      input.startsAtUtc,
      input.endsAtUtc,
      input.offset,
    ]),
  ).toEqual([
    [undefined, undefined, 0],
    [undefined, undefined, 1],
  ]);
});

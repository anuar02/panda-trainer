import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getSupabaseClient } from '@/features/auth/client';
import { useClientRead } from '@/features/workspace-clients/use-client-read';
import { setupRead, userId } from './workspace-client-read-fixtures';

jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(() => jest.resetAllMocks());

test.each(['success', 'error'])(
  'scope revisit and unmount suppress late %s',
  async (kind) => {
    setupRead();
    const pending = deferred();
    const load = jest
      .fn<Promise<string>, [AbortSignal]>()
      .mockResolvedValueOnce('scope A')
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue('new scope A');
    const hook = await renderHook(
      ({ key }: { key: string }) =>
        useClientRead(key, userId, 'original-token', load),
      { initialProps: { key: 'A' } },
    );
    await waitFor(() => expect(hook.result.current.data).toBe('scope A'));
    await hook.rerender({ key: 'B' });
    expect(hook.result.current.data).toBeNull();
    await hook.rerender({ key: 'A' });
    await waitFor(() => expect(hook.result.current.data).toBe('new scope A'));
    await act(async () => {
      if (kind === 'success') pending.resolve('old B');
      else pending.reject(new Error('old B'));
    });
    expect(hook.result.current.data).toBe('new scope A');
    await hook.unmount();
    expect(jest.mocked(getSupabaseClient)).toHaveBeenCalled();
  },
);

test('auth events discard displayed data for logout and same-user session changes; refresh stays valid', async () => {
  const read = setupRead();
  const load = jest.fn(async () => 'snapshot');
  const hook = await renderHook(() =>
    useClientRead('scope', userId, 'original-token', load),
  );
  await waitFor(() => expect(hook.result.current.data).toBe('snapshot'));
  await act(async () => read.emit('TOKEN_REFRESHED', read.session('refresh')));
  expect(hook.result.current.data).toBe('snapshot');
  await act(async () => read.emit('SIGNED_IN', read.session('new-session')));
  expect(hook.result.current.data).toBeNull();
  expect(hook.result.current.failed).toBe(true);
  await act(async () => hook.result.current.retry());
  expect(load).toHaveBeenCalledTimes(1);
  await hook.unmount();
  expect(read.unsubscribe).toHaveBeenCalledTimes(1);
});

test('logout while pending and a late failure after unmount never restore data', async () => {
  const read = setupRead();
  const pending = deferred();
  const load = jest.fn(() => pending.promise);
  const hook = await renderHook(() =>
    useClientRead('scope', userId, 'original-token', load),
  );
  await act(async () => read.emit('SIGNED_OUT', null));
  expect(hook.result.current.data).toBeNull();
  await hook.unmount();
  await act(async () => pending.reject(new Error('late error')));
});

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useClientProgram } from '../src/features/client-program/use-program';
import {
  ClientProgramError,
  loadLatestClientProgram,
  type ClientProgramData,
} from '../src/features/client-program/service';
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
jest.mock('../src/features/client-program/service', () => ({
  ...jest.requireActual<
    typeof import('../src/features/client-program/service')
  >('../src/features/client-program/service'),
  loadLatestClientProgram: jest.fn(),
}));
const load = jest.mocked(loadLatestClientProgram);
const scope = { userId: 'user-a', clientRecordId: 'card-a' };
const data: ClientProgramData = {
  context: {
    clientRecordId: 'card-a',
    workspaceId: 'workspace',
    timezone: 'UTC',
    clientName: 'Client',
    trainerName: 'Trainer',
  },
  program: null,
};
function deferred() {
  let resolve!: (value: ClientProgramData) => void;
  const promise = new Promise<ClientProgramData>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  mockFocused = true;
  load.mockReset();
});
test.each([{ userId: 'user-b' }, { clientRecordId: 'card-b' }])(
  'scope change hides old copy and ignores late response %p',
  async (change) => {
    const pending = deferred();
    load.mockResolvedValueOnce(data).mockReturnValueOnce(pending.promise);
    const hook = await renderHook(useClientProgram, { initialProps: scope });
    await waitFor(() => expect(hook.result.current.data).toEqual(data));
    await hook.rerender({ ...scope, ...change });
    expect(hook.result.current.data).toBeNull();
    load.mockResolvedValue(data);
    await hook.rerender(scope);
    await act(async () =>
      pending.resolve({
        ...data,
        context: { ...data.context, trainerName: 'Old' },
      }),
    );
    expect(hook.result.current.data?.context.trainerName).not.toBe('Old');
  },
);
test('blur discards pending response and refocus refreshes', async () => {
  const pending = deferred();
  load.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(data);
  const hook = await renderHook(useClientProgram, { initialProps: scope });
  mockFocused = false;
  await hook.rerender(scope);
  await act(async () => pending.resolve(data));
  expect(hook.result.current.data).toBeNull();
  mockFocused = true;
  await hook.rerender(scope);
  await waitFor(() => expect(hook.result.current.data).toEqual(data));
  expect(load).toHaveBeenCalledTimes(2);
});
test('typed error supports explicit retry', async () => {
  load
    .mockRejectedValueOnce(new ClientProgramError('unavailable'))
    .mockResolvedValueOnce(data);
  const hook = await renderHook(useClientProgram, { initialProps: scope });
  await waitFor(() => expect(hook.result.current.error).toBe('unavailable'));
  await act(async () => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.data).toEqual(data));
  expect(hook.result.current.error).toBeNull();
});

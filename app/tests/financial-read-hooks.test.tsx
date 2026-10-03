import { StrictMode, type PropsWithChildren } from 'react';
import type {
  TrainerBilling,
  BillingScope,
} from '../src/features/trainer-billing/types';
import type { TrainerPayments } from '../src/features/trainer-payments/types';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/features/auth/client';
import { loadTrainerBilling } from '../src/features/trainer-billing/service';
import { loadTrainerPayments } from '../src/features/trainer-payments/service';
import { useTrainerBilling } from '../src/features/trainer-billing/use-billing';
import { useTrainerPayments } from '../src/features/trainer-payments/use-payments';
import { financialToken } from './financial-read-fixtures';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/trainer-billing/service', () => ({
  loadTrainerBilling: jest.fn(),
}));
jest.mock('../src/features/trainer-payments/service', () => ({
  loadTrainerPayments: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) =>
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(effect, [effect]),
}));
const user = '95000000-0000-4000-8000-000000000001';
const sid = '95000000-0000-4000-8000-000000000002';
const session = (sessionId = sid, version = 1) =>
  ({
    user: { id: user },
    access_token: financialToken(user, sessionId, version),
  }) as Session;
let current: Session | null;
let listeners: Set<(event: AuthChangeEvent, session: Session | null) => void>;
const emit = (event: AuthChangeEvent, next: Session | null) => {
  current = next;
  for (const listener of listeners) listener(event, next);
};
const billing = { purchases: [], attendance: [], revisions: [], credits: [] };
const payments = { entries: [] };
beforeEach(() => {
  jest.resetAllMocks();
  current = session();
  listeners = new Set();
  jest.mocked(loadTrainerBilling).mockResolvedValue(billing);
  jest.mocked(loadTrainerPayments).mockResolvedValue(payments);
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession: async () => ({ data: { session: current }, error: null }),
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
    },
  } as unknown as NonNullable<ReturnType<typeof getSupabaseClient>>);
});
const cases = [
  {
    name: 'billing',
    hook: useTrainerBilling,
    load: jest.mocked(loadTrainerBilling) as unknown as jest.Mock<
      Promise<TrainerBilling | TrainerPayments>,
      [BillingScope]
    >,
    data: billing,
  },
  {
    name: 'payments',
    hook: useTrainerPayments,
    load: jest.mocked(loadTrainerPayments) as unknown as jest.Mock<
      Promise<TrainerBilling | TrainerPayments>,
      [BillingScope]
    >,
    data: payments,
  },
];
test.each(cases)(
  '$name clears completed data for same-user relogin and discards stale retry',
  async ({ hook: useRead, load, data }) => {
    const hook = await renderHook(() => useRead(user, 'workspace', 'client'));
    await waitFor(() => expect(hook.result.current.data).toEqual(data));
    const oldRetry = hook.result.current.retry;
    load.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      emit('SIGNED_OUT', null);
      emit('SIGNED_IN', session('95000000-0000-4000-8000-000000000003'));
    });
    expect(hook.result.current.data).toBeNull();
    const count = load.mock.calls.length;
    await act(async () => oldRetry());
    expect(load).toHaveBeenCalledTimes(count);
    await hook.unmount();
    await act(async () => hook.result.current.retry());
    expect(load).toHaveBeenCalledTimes(count);
    expect(listeners.size).toBe(0);
  },
);
test.each(cases)(
  '$name refresh preserves data and does not restart reads',
  async ({ hook: useRead, load, data }) => {
    const hook = await renderHook(() => useRead(user, 'workspace', 'client'));
    await waitFor(() => expect(hook.result.current.data).toEqual(data));
    const count = load.mock.calls.length;
    await act(async () => emit('TOKEN_REFRESHED', session(sid, 2)));
    expect(hook.result.current.data).toEqual(data);
    expect(load).toHaveBeenCalledTimes(count);
  },
);
test.each(
  cases.flatMap((item) =>
    ['success', 'error'].map((outcome) => ({ ...item, outcome })),
  ),
)(
  '$name drops late $outcome after retry and session switch',
  async ({ hook: useRead, load, data, outcome }) => {
    const hook = await renderHook(() => useRead(user, 'workspace', 'client'));
    await waitFor(() => expect(hook.result.current.data).toEqual(data));
    let resolve: (value: typeof data) => void = () => {};
    let reject: (error: Error) => void = () => {};
    const pending = new Promise<typeof data>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    load.mockImplementationOnce(() => pending as ReturnType<typeof load>);
    await act(async () => hook.result.current.retry());
    expect(hook.result.current.data).toBeNull();
    await act(async () => {
      emit('SIGNED_OUT', null);
      emit('SIGNED_IN', session('95000000-0000-4000-8000-000000000003'));
    });
    await waitFor(() => expect(hook.result.current.data).toEqual(data));
    await act(async () => {
      if (outcome === 'success') resolve(data);
      else reject(new Error('synthetic'));
    });
    expect(hook.result.current.data).toEqual(data);
    expect(hook.result.current.error).toBeNull();
  },
);
test.each(cases)(
  '$name drops late errors after unmount and old scope retries',
  async ({ hook: useRead, load, data }) => {
    const hook = await renderHook<
      ReturnType<typeof useRead>,
      { workspace: string }
    >(({ workspace }) => useRead(user, workspace, 'client'), {
      initialProps: { workspace: 'first' },
    });
    await waitFor(() => expect(hook.result.current.data).toEqual(data));
    const oldRetry = hook.result.current.retry;
    await hook.rerender({ workspace: 'second' });
    await waitFor(() => expect(hook.result.current.data).toEqual(data));
    const count = load.mock.calls.length;
    await act(async () => oldRetry());
    expect(load).toHaveBeenCalledTimes(count);
    let reject: (error: Error) => void = () => {};
    load.mockImplementationOnce(
      () =>
        new Promise((_done, fail) => {
          reject = fail;
        }),
    );
    await act(async () => hook.result.current.retry());
    await hook.unmount();
    await act(async () => reject(new Error('synthetic')));
    expect(listeners.size).toBe(0);
  },
);

test.each(cases)(
  '$name ignores an earlier retry response without a session switch',
  async ({ hook: useRead, load, data }) => {
    const hook = await renderHook(() => useRead(user, 'workspace', 'client'));
    await waitFor(() => expect(hook.result.current.data).toEqual(data));
    let reject: (error: Error) => void = () => {};
    load.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    await act(async () => hook.result.current.retry());
    await act(async () => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.data).toEqual(data));
    await act(async () => reject(new Error('old retry')));
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.data).toEqual(data);
  },
);

test.each(cases)(
  '$name restores a current epoch after effect cleanup in StrictMode',
  async ({ hook: useRead, data }) => {
    const hook = await renderHook(() => useRead(user, 'workspace', 'client'), {
      wrapper: ({ children }: PropsWithChildren) => (
        <StrictMode>{children}</StrictMode>
      ),
    });
    await waitFor(() => expect(hook.result.current.data).toEqual(data));
    await act(async () => emit('TOKEN_REFRESHED', session(sid, 2)));
    expect(hook.result.current.data).toEqual(data);
  },
);

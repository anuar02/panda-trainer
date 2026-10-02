import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTrainerBilling } from '../src/features/trainer-billing/use-billing';
import { useTrainerBillingCommands } from '../src/features/trainer-billing/use-commands';
import { loadTrainerBilling } from '../src/features/trainer-billing/service';
import {
  loadPendingTrainerBillingCommand,
  PendingTrainerBillingCommandError,
} from '../src/features/trainer-billing/command-storage';
import {
  submitTrainerBillingCommand,
  type TrainerBillingCommand,
} from '../src/features/trainer-billing/commands';
import type { TrainerBilling } from '../src/features/trainer-billing/types';
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) => {
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(effect, [effect]);
  },
}));
jest.mock('../src/features/trainer-billing/service', () => ({
  loadTrainerBilling: jest.fn(),
}));
jest.mock('../src/features/trainer-billing/command-storage', () => {
  const actual = jest.requireActual(
    '../src/features/trainer-billing/command-storage',
  );
  return { ...actual, loadPendingTrainerBillingCommand: jest.fn() };
});
jest.mock('../src/features/trainer-billing/commands', () => {
  const actual = jest.requireActual('../src/features/trainer-billing/commands');
  return { ...actual, submitTrainerBillingCommand: jest.fn() };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {},
}));
const command: TrainerBillingCommand = {
  action: 'markNoShow',
  bookingId: '11111111-1111-4111-8111-111111111111',
  expectedBookingRevision: 1,
  requestId: '22222222-2222-4222-8222-222222222222',
};
const empty: TrainerBilling = {
  purchases: [],
  attendance: [],
  revisions: [],
  credits: [],
};
beforeEach(() => jest.clearAllMocks());
test('billing hides previous account data and ignores delayed response', async () => {
  let complete = (_value: TrainerBilling) => {};
  jest
    .mocked(loadTrainerBilling)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    )
    .mockResolvedValueOnce(empty);
  const hook = await renderHook<
    ReturnType<typeof useTrainerBilling>,
    { user: string }
  >(({ user }) => useTrainerBilling(user, 'workspace'), {
    initialProps: { user: 'first' },
  });
  await hook.rerender({ user: 'second' });
  await waitFor(() => expect(hook.result.current.data).toEqual(empty));
  await act(async () =>
    complete({
      ...empty,
      purchases: [
        {
          id: 'old',
          workspaceId: 'workspace',
          clientRecordId: 'old',
          title: 'old',
          units: 1,
          priceMinor: '1',
          currency: 'KZT',
          expiresOn: null,
          createdAt: 'old',
        },
      ],
    }),
  );
  expect(hook.result.current.data).toEqual(empty);
});
test('read failure never reveals prior account billing', async () => {
  jest
    .mocked(loadTrainerBilling)
    .mockResolvedValueOnce(empty)
    .mockRejectedValueOnce(new Error('offline'));
  const hook = await renderHook<
    ReturnType<typeof useTrainerBilling>,
    { user: string }
  >(({ user }) => useTrainerBilling(user, 'workspace'), {
    initialProps: { user: 'first' },
  });
  await waitFor(() => expect(hook.result.current.data).toEqual(empty));
  await hook.rerender({ user: 'second' });
  await waitFor(() => expect(hook.result.current.error).toBe('request'));
  expect(hook.result.current.data).toBeNull();
});
test('failed pending read blocks submission until explicit reload succeeds', async () => {
  jest
    .mocked(loadPendingTrainerBillingCommand)
    .mockRejectedValueOnce(new PendingTrainerBillingCommandError('storage'))
    .mockResolvedValueOnce(null);
  const hook = await renderHook(() =>
    useTrainerBillingCommands({
      userId: 'user',
      workspaceId: 'workspace',
      onChanged: jest.fn(),
    }),
  );
  await waitFor(() => expect(hook.result.current.error).toBe('storage'));
  expect(hook.result.current.blocked).toBe(true);
  await act(async () => {
    expect(await hook.result.current.submit(command)).toBe(false);
  });
  expect(submitTrainerBillingCommand).not.toHaveBeenCalled();
  await act(async () => hook.result.current.reload());
  await waitFor(() => expect(hook.result.current.blocked).toBe(false));
});
test('scope switch during submit suppresses old completion and onChanged', async () => {
  let complete = (
    _value: Awaited<ReturnType<typeof submitTrainerBillingCommand>>,
  ) => {};
  jest.mocked(loadPendingTrainerBillingCommand).mockResolvedValue(null);
  jest.mocked(submitTrainerBillingCommand).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const changed = jest.fn();
  const hook = await renderHook<
    ReturnType<typeof useTrainerBillingCommands>,
    { user: string }
  >(
    ({ user }) =>
      useTrainerBillingCommands({
        userId: user,
        workspaceId: 'workspace',
        onChanged: changed,
      }),
    { initialProps: { user: 'first' } },
  );
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  let submitted: Promise<boolean> = Promise.resolve(true);
  await act(async () => {
    submitted = hook.result.current.submit(command);
  });
  await hook.rerender({ user: 'second' });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => {
    complete({
      purchaseId: 'id',
      workspaceId: 'workspace',
      clientRecordId: 'client',
      replayed: false,
    });
    expect(await submitted).toBe(false);
  });
  expect(changed).not.toHaveBeenCalled();
  expect(hook.result.current.pending).toBeNull();
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccountDeletionScreen } from '@/features/account-deletion/screen';
import { createDeletionController } from '@/features/account-deletion/controller';
import { readConfirmedDeletion } from '@/features/account-deletion/pending';
import { useAuth } from '@/features/auth/provider';
import { getSupabaseClient } from '@/features/auth/client';

jest.mock('@/features/account-deletion/storage-fence', () => ({
  fenceDeletionPendingWrites: jest.fn(async () => {}),
}));

jest.mock('@/features/auth/service', () => ({
  signOutForAccountDeletion: jest.fn(async () => {}),
}));
jest.mock('@/features/account-export/controls', () => ({
  AccountExportControls: () => null,
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/features/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('@/features/account-export/file', () => ({
  saveExportFile: jest.fn(),
}));
jest.mock('@/features/account-export/service', () => ({
  boundedExportStep: (value: unknown) => value,
}));
jest.mock('@/features/account-deletion/service', () => ({
  inspectDeletion: jest.fn(),
  requireDeletionSession: jest.fn(),
  sendDeletion: jest.fn(),
}));
jest.mock('@/features/account-deletion/pending', () => ({
  readConfirmedDeletion: jest.fn(),
  saveConfirmedDeletion: jest.fn(),
  clearConfirmedDeletion: jest.fn(),
}));
jest.mock('@/features/account-deletion/local', () => ({
  readDeletionLocal: jest.fn(
    async (_account: string, guard: () => Promise<void>) => {
      await guard();
      return {};
    },
  ),
  cleanupDeletedAccountCache: jest.fn(),
  fenceDeletionLocal: jest.fn(),
  canResumeDeletionCleanup: jest.fn(),
}));
jest.mock('@/features/account-deletion/controller', () => ({
  createDeletionController: jest.fn(() => ({
    explain: jest.fn(),
    prepare: jest.fn(),
    export: jest.fn(),
    acknowledge: jest.fn(),
    delete: jest.fn(),
    recover: jest.fn(),
    cancel: jest.fn(),
    stop: jest.fn(),
  })),
}));
jest.mock('@/ui/screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/ui/text', () => ({
  Text: jest.requireActual<typeof import('react-native')>('react-native').Text,
}));
jest.mock('@/ui/button', () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => {
    const { createElement: element } =
      jest.requireActual<typeof import('react')>('react');
    const Native =
      jest.requireActual<typeof import('react-native')>('react-native');
    return element(
      Native.Pressable,
      {
        onPress,
        accessibilityRole: 'button',
        accessibilityLabel: label,
        accessibilityState: { disabled },
        disabled,
      },
      element(Native.Text, {}, label),
    );
  },
}));

const accountId = '10000000-0000-4000-8000-000000000001';
const session = {
  user: { id: accountId },
  access_token: 'synthetic-original-login',
};
const intent = {
  accountId,
  requestId: '20000000-0000-4000-8000-000000000001',
  recoveryToken: 'b'.repeat(64),
  fingerprint: 'a'.repeat(64),
  exportSha256: 'c'.repeat(64),
  exportBytes: 100,
  snapshotId: '30000000-0000-4000-8000-000000000001',
  confirmed: true as const,
};
let activeSession: typeof session | null;
beforeEach(() => {
  jest.clearAllMocks();
  activeSession = session;
  jest
    .mocked(useAuth)
    .mockImplementation(
      () => ({ session: activeSession }) as ReturnType<typeof useAuth>,
    );
  jest.mocked(readConfirmedDeletion).mockResolvedValue(null);
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession: async () => ({
        error: null,
        data: { session: activeSession },
      }),
      signOut: async () => ({ error: null }),
    },
  } as unknown as ReturnType<typeof getSupabaseClient>);
});
async function mounted() {
  const view = await render(<AccountDeletionScreen />);
  await waitFor(() =>
    expect(createDeletionController).toHaveBeenCalledTimes(1),
  );
  const deps = jest.mocked(createDeletionController).mock.calls[0]![1];
  const controller = jest.mocked(createDeletionController).mock.results[0]!
    .value as ReturnType<typeof createDeletionController>;
  return { view, deps, controller };
}

test('local logout preserves original controller and delete continuation identity', async () => {
  const { view, deps, controller } = await mounted();
  await act(() => deps.publish('deleting'));
  activeSession = null;
  await view.rerender(<AccountDeletionScreen />);
  expect(createDeletionController).toHaveBeenCalledTimes(1);
  expect(controller.stop).not.toHaveBeenCalled();
  expect(jest.mocked(createDeletionController).mock.calls[0]![0]).toEqual({
    accountId,
    token: session.access_token,
  });
  await expect(deps.read()).resolves.toBeDefined();
});

test('same-account new login keeps pinned intent but prevents local reads from old controller', async () => {
  const { view, deps } = await mounted();
  activeSession = { ...session, access_token: 'synthetic-new-login' };
  await view.rerender(<AccountDeletionScreen />);
  expect(createDeletionController).toHaveBeenCalledTimes(1);
  await expect(deps.read()).rejects.toThrow('session_changed');
});

test('foreign authenticated user cannot activate restored account recovery', async () => {
  jest.mocked(readConfirmedDeletion).mockResolvedValue(intent);
  activeSession = { ...session, user: { id: 'foreign-account' } };
  const { view, deps, controller } = await mounted();
  const recover = view.getByRole('button', { name: 'accountDeletion.recover' });
  expect(recover.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(recover);
  expect(controller.recover).not.toHaveBeenCalled();
  await expect(deps.read()).rejects.toThrow('session_changed');
});

test('signed-out restored intent offers explicit capability recovery and login', async () => {
  jest.mocked(readConfirmedDeletion).mockResolvedValue(intent);
  activeSession = null;
  const { view, deps, controller } = await mounted();
  expect(jest.mocked(createDeletionController).mock.calls[0]![0]).toEqual({
    accountId,
    token: '',
  });
  await fireEvent.press(
    view.getByRole('button', { name: 'accountDeletion.recover' }),
  );
  expect(controller.recover).toHaveBeenCalledTimes(1);
  expect(
    view.getByRole('button', { name: 'accountDeletion.login' }),
  ).toBeDefined();
  await expect(deps.read()).resolves.toBeDefined();
});

test('unmount stops controller and invalidates late local read guard', async () => {
  const { view, deps, controller } = await mounted();
  await view.unmount();
  expect(controller.stop).toHaveBeenCalledTimes(1);
  await expect(deps.read()).rejects.toThrow('dismissed');
});

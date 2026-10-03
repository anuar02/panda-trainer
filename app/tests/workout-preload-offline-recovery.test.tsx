import type { PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Text, View } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { useAuth } from '@/features/auth/provider';
import { findWorkoutPreloadRecovery } from '@/features/workout-preload/bootstrap';
import {
  createWorkoutPreloadReader,
  WorkoutPreloadReadError,
} from '@/features/workout-preload/service';
import { WorkoutPreloadOfflineRecovery } from '@/features/workout-preload/offline-recovery';
import '../src/lib/i18n';

jest.mock('../src/features/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('../src/features/workout-preload/bootstrap', () => ({
  findWorkoutPreloadRecovery: jest.fn(),
}));
jest.mock('../src/features/workout-preload/service', () => ({
  ...jest.requireActual<
    typeof import('../src/features/workout-preload/service')
  >('../src/features/workout-preload/service'),
  createWorkoutPreloadReader: jest.fn(),
}));
jest.mock('../src/features/workout-preload/provider', () => ({
  WorkoutPreloadProvider: ({
    workspaceId,
    children,
  }: PropsWithChildren<{ workspaceId: string }>) => {
    const native =
      jest.requireActual<typeof import('react-native')>('react-native');
    const react = jest.requireActual<typeof import('react')>('react');
    return react.createElement(
      native.View,
      { testID: `provider-${workspaceId}` },
      children,
    );
  },
}));
jest.mock('../src/features/workout-preload/dock', () => ({
  WorkoutPreloadDock: () => {
    const native =
      jest.requireActual<typeof import('react-native')>('react-native');
    const react = jest.requireActual<typeof import('react')>('react');
    return react.createElement(native.View, { testID: 'production-dock' });
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('expo-crypto', () => {
  let count = 0;
  return { randomUUID: () => `generation-${++count}` };
});
const cached: NonNullable<
  Awaited<ReturnType<typeof findWorkoutPreloadRecovery>>
> = {
  scope: { accountId: 'account', workspaceId: 'own-workspace' },
  context: {
    version: 1,
    scope: { accountId: 'account', workspaceId: 'own-workspace' },
    sessionKey: 'booking',
    startsAt: '2026-10-03T10:00:00Z',
    loadedAt: '2026-10-03T09:00:00Z',
    participants: [],
  },
  recovery: {
    version: 1,
    sessionKey: 'booking',
    bookingId: 'booking',
    clientRecordId: 'client',
    collapsed: true,
  },
};
const load = jest.fn<
  ReturnType<ReturnType<typeof createWorkoutPreloadReader>['load']>,
  Parameters<ReturnType<typeof createWorkoutPreloadReader>['load']>
>();
function auth(accountId: string | null = 'account') {
  const session: Session | null = accountId
    ? {
        access_token: `token-${accountId}`,
        refresh_token: 'refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: accountId,
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: '2026-10-03',
        },
      }
    : null;
  jest.mocked(useAuth).mockReturnValue({
    session,
    loading: false,
    failed: false,
    configured: true,
    retry: jest.fn(),
  });
}
function show() {
  return render(
    <WorkoutPreloadOfflineRecovery onRetry={jest.fn()}>
      <Text>Workspace child</Text>
    </WorkoutPreloadOfflineRecovery>,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  auth();
  jest.mocked(findWorkoutPreloadRecovery).mockResolvedValue(cached);
  jest.mocked(createWorkoutPreloadReader).mockReturnValue({ load });
  load.mockRejectedValue(new WorkoutPreloadReadError('network'));
});

it('opens own scoped cached workspace, provider and dock only for network fallback', async () => {
  await show();
  await waitFor(() => expect(screen.getByText('Workspace child')).toBeTruthy());
  expect(screen.getByTestId('provider-own-workspace')).toBeTruthy();
  expect(screen.getByTestId('production-dock')).toBeTruthy();
  expect(findWorkoutPreloadRecovery).toHaveBeenCalledWith('account');
  expect(load).toHaveBeenCalledWith(
    expect.objectContaining({
      accountId: 'account',
      workspaceId: 'own-workspace',
      accessToken: 'token-account',
    }),
    'booking',
    expect.any(AbortSignal),
  );
});
it.each(['unavailable', 'request', 'invalidInput', 'configuration'] as const)(
  'blocks cached recovery on %s instead of false success',
  async (code) => {
    load.mockRejectedValue(new WorkoutPreloadReadError(code));
    await show();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByText('Workspace child')).toBeNull();
    expect(screen.queryByTestId('production-dock')).toBeNull();
  },
);
it('blocks unknown errors rather than treating them as offline', async () => {
  load.mockRejectedValue(new Error('malformed'));
  await show();
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.queryByText('Workspace child')).toBeNull();
});
it('blocks missing cache without calling the reader', async () => {
  jest.mocked(findWorkoutPreloadRecovery).mockResolvedValue(null);
  await show();
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(load).not.toHaveBeenCalled();
  expect(screen.queryByText('Workspace child')).toBeNull();
});
it('reports discovery storage failure without rendering workspace', async () => {
  jest
    .mocked(findWorkoutPreloadRecovery)
    .mockRejectedValue(new Error('sqlite'));
  await show();
  await waitFor(() =>
    expect(
      screen.getByText(
        'Не удалось восстановить данные на телефоне. Повторите попытку.',
      ),
    ).toBeTruthy(),
  );
  expect(screen.queryByText('Workspace child')).toBeNull();
});
it('discards discovery after logout', async () => {
  let resolve!: (value: typeof cached) => void;
  jest.mocked(findWorkoutPreloadRecovery).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const result = await show();
  auth(null);
  await result.rerender(
    <WorkoutPreloadOfflineRecovery onRetry={jest.fn()}>
      <View />
    </WorkoutPreloadOfflineRecovery>,
  );
  await act(async () => resolve(cached));
  expect(load).not.toHaveBeenCalled();
  expect(screen.queryByTestId('production-dock')).toBeNull();
});
it('discards an old account probe after switching accounts', async () => {
  let reject!: (error: Error) => void;
  load.mockReturnValueOnce(
    new Promise((_done, fail) => {
      reject = fail;
    }),
  );
  const result = await show();
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  auth('other');
  jest.mocked(findWorkoutPreloadRecovery).mockResolvedValue(null);
  await result.rerender(
    <WorkoutPreloadOfflineRecovery onRetry={jest.fn()}>
      <Text>Workspace child</Text>
    </WorkoutPreloadOfflineRecovery>,
  );
  await act(async () => reject(new WorkoutPreloadReadError('network')));
  await waitFor(() =>
    expect(findWorkoutPreloadRecovery).toHaveBeenLastCalledWith('other'),
  );
  expect(screen.queryByText('Workspace child')).toBeNull();
  expect(screen.queryByTestId('provider-own-workspace')).toBeNull();
});

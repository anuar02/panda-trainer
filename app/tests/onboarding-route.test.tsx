import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Text as MockText } from 'react-native';
import { router } from 'expo-router';
import OnboardingRoute from '../app/auth/onboarding';
import { authService } from '@/features/auth/service';
import { loadWorkspaceClients } from '@/features/workspace-clients/service';
import {
  actor,
  anotherLogin,
  deferred,
  session,
  setupOnboarding,
  workspaceId,
} from './onboarding-fixtures';
import '../src/lib/i18n';

let mockSession = session();
let mockFocused = true;
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('@/features/auth/provider', () => ({
  useAuth: () => ({ session: mockSession, loading: false, failed: false }),
}));
jest.mock('@/features/auth/service', () => ({
  authService: { signOut: jest.fn() },
}));
jest.mock('@/ui/mascot', () => ({ Mascot: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  Redirect: ({ href }: { href: string }) => <MockText>{href}</MockText>,
  useFocusEffect: (callback: () => void) =>
    jest.requireActual<typeof import('react')>('react').useEffect(() => {
      if (mockFocused) return callback();
    }, [callback, mockFocused]),
}));
beforeEach(() => {
  mockSession = session();
  mockFocused = true;
});
afterEach(() => jest.resetAllMocks());
async function goToClient() {
  await waitFor(() =>
    expect(screen.getByText('Я тренер — начать')).toBeTruthy(),
  );
  await fireEvent.press(screen.getByText('Я тренер — начать'));
  await fireEvent.changeText(screen.getByLabelText('Имя'), 'Synthetic trainer');
  await fireEvent.press(screen.getByText('Продолжить'));
  await fireEvent.press(screen.getByText('Продолжить'));
}

test.each([true, false])(
  'synthetic first trainer → optional client %s → real clients → returning account',
  async (includeClient) => {
    const read = setupOnboarding({ first: true, honorFilters: true });
    const view = await render(<OnboardingRoute />);
    await goToClient();
    if (includeClient) {
      await fireEvent.changeText(
        screen.getByLabelText('Имя и фамилия'),
        'Optional synthetic client',
      );
      await fireEvent.press(screen.getByText('Добавить клиента'));
    } else await fireEvent.press(screen.getByText('Добавлю позже'));
    await waitFor(() =>
      expect(screen.getByText('Всё готово, Synthetic trainer!')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Перейти на главную'));
    expect(router.replace).toHaveBeenCalledWith('/workspace/clients');
    const clients = await loadWorkspaceClients(workspaceId, {
      userId: actor,
      token: mockSession.access_token,
    });
    expect(clients.map((c) => c.display_name)).toEqual(
      includeClient ? ['Optional synthetic client'] : [],
    );
    mockFocused = false;
    await view.rerender(<OnboardingRoute />);
    mockFocused = true;
    await view.rerender(<OnboardingRoute />);
    await waitFor(() => expect(screen.getByText('/auth/account')).toBeTruthy());
    expect(read.creations()).toBe(1);
  },
);

test('empty name stays on form; offline/unknown result retry uses captured payload and double tap makes one in-flight RPC', async () => {
  const ready = deferred<void>();
  const release = deferred<void>();
  let rpcCalls = 0;
  const read = setupOnboarding({
    first: true,
    honorFilters: true,
    io: async (io) => {
      if (io.label === 'complete_trainer_onboarding' && ++rpcCalls === 1) {
        ready.resolve();
        await release.promise;
      }
    },
  });
  read.setResult(null);
  await render(<OnboardingRoute />);
  await waitFor(() =>
    expect(screen.getByText('Я тренер — начать')).toBeTruthy(),
  );
  await fireEvent.press(screen.getByText('Я тренер — начать'));
  await fireEvent.press(screen.getByText('Продолжить'));
  expect(screen.getByText('Введите имя — так вас увидят клиенты')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Имя'), 'Synthetic trainer');
  await fireEvent.press(screen.getByText('Продолжить'));
  await fireEvent.press(screen.getByText('Продолжить'));
  await fireEvent.changeText(
    screen.getByLabelText('Имя и фамилия'),
    'Original client',
  );
  await fireEvent.press(screen.getByText('Добавить клиента'));
  await ready.promise;
  await fireEvent.press(screen.getByText('Добавить клиента'));
  expect(rpcCalls).toBe(1);
  await act(async () => release.resolve());
  await waitFor(() =>
    expect(
      screen.getByText('Не удалось сохранить настройки. Попробуйте ещё раз.'),
    ).toBeTruthy(),
  );
  expect(router.replace).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      'Ответ мог потеряться. Повторим исходные настройки без создания дубликатов.',
    ),
  ).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText('Имя и фамилия'),
    'Edited after ambiguous response',
  );
  read.setResult(undefined);
  await fireEvent.press(screen.getByText('Добавить клиента'));
  await waitFor(() =>
    expect(
      screen.getByText(
        'Original client · карточка создана, приглашение пока недоступно',
      ),
    ).toBeTruthy(),
  );
  expect(read.creations()).toBe(1);
  const payloads = read.calls
    .filter((c) => c.label === 'complete_trainer_onboarding')
    .map((c) => c.args);
  expect(payloads[1]).toEqual(payloads[0]);
});

test.each(['success', 'error'])(
  'same-user relogin during submit suppresses old %s and leaves new form unlocked',
  async (kind) => {
    const ready = deferred<void>();
    const release = deferred<void>();
    let rpcCalls = 0;
    const read = setupOnboarding({
      first: true,
      io: async (io) => {
        if (io.label === 'complete_trainer_onboarding' && ++rpcCalls === 1) {
          ready.resolve();
          await release.promise;
          if (kind === 'error') throw new Error(kind);
        }
      },
    });
    const view = await render(<OnboardingRoute />);
    await goToClient();
    await fireEvent.press(screen.getByText('Добавлю позже'));
    await ready.promise;
    mockSession = session(anotherLogin);
    await act(async () => read.emit('SIGNED_IN', mockSession));
    await view.rerender(<OnboardingRoute />);
    await goToClient();
    await act(async () => release.resolve());
    expect(
      screen.queryByText('Не удалось сохранить настройки. Попробуйте ещё раз.'),
    ).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Добавлю позже'));
    await waitFor(() =>
      expect(screen.getByText('Всё готово, Synthetic trainer!')).toBeTruthy(),
    );
    expect(rpcCalls).toBe(2);
  },
);

test('unmount while submitting discards late result/navigation', async () => {
  const ready = deferred<void>();
  const release = deferred<void>();
  const read = setupOnboarding({
    first: true,
    io: async (io) => {
      if (io.label === 'complete_trainer_onboarding') {
        ready.resolve();
        await release.promise;
      }
    },
  });
  const view = await render(<OnboardingRoute />);
  await goToClient();
  await fireEvent.press(screen.getByText('Добавлю позже'));
  await ready.promise;
  await view.unmount();
  await act(async () => release.resolve());
  expect(router.replace).not.toHaveBeenCalled();
  expect(read.subscriptions()).toBe(0);
});

test('returning client role is kept; read failure offers retry without setup/demo', async () => {
  const read = setupOnboarding({ connections: true });
  read.tables.trainer_workspaces = [];
  const view = await render(<OnboardingRoute />);
  await waitFor(() => expect(screen.getByText('/auth/account')).toBeTruthy());
  read.setFailure('offline');
  mockFocused = false;
  await view.rerender(<OnboardingRoute />);
  mockFocused = true;
  await view.rerender(<OnboardingRoute />);
  await waitFor(() =>
    expect(screen.getByText('Попробовать снова')).toBeTruthy(),
  );
  expect(screen.queryByText('Я тренер — начать')).toBeNull();
  read.setFailure(null);
  await fireEvent.press(screen.getByText('Попробовать снова'));
  await waitFor(() => expect(screen.getByText('/auth/account')).toBeTruthy());
});

test.each(Array.from({ length: 18 }, (_, index) => index + 1))(
  'route relogin at completion I/O %i never publishes old done/navigation',
  async (checkpoint) => {
    const ready = deferred<void>();
    const release = deferred<void>();
    let armed = false;
    let seen = 0;
    const read = setupOnboarding({
      first: true,
      io: async () => {
        if (armed && ++seen === checkpoint) {
          ready.resolve();
          await release.promise;
        }
      },
    });
    const view = await render(<OnboardingRoute />);
    await goToClient();
    armed = true;
    await fireEvent.press(screen.getByText('Добавлю позже'));
    await ready.promise;
    armed = false;
    mockSession = session(anotherLogin);
    await act(async () => read.emit('SIGNED_IN', mockSession));
    await view.rerender(<OnboardingRoute />);
    await act(async () => release.resolve());
    await waitFor(() => expect(screen.queryByText('Загрузка…')).toBeNull());
    expect(screen.queryByText('Всё готово, Synthetic trainer!')).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    await view.unmount();
    expect(read.subscriptions()).toBe(0);
  },
);

test('empty days block submission and can be repaired before any RPC', async () => {
  const read = setupOnboarding({ first: true });
  await render(<OnboardingRoute />);
  await waitFor(() =>
    expect(screen.getByText('Я тренер — начать')).toBeTruthy(),
  );
  await fireEvent.press(screen.getByText('Я тренер — начать'));
  await fireEvent.changeText(screen.getByLabelText('Имя'), 'Synthetic trainer');
  await fireEvent.press(screen.getByText('Продолжить'));
  for (const day of ['пн', 'вт', 'ср', 'чт', 'пт', 'сб'])
    await fireEvent.press(screen.getByText(day));
  await fireEvent.press(screen.getByLabelText('Пропустить'));
  expect(screen.getByLabelText('Пропустить')).toBeDisabled();
  expect(screen.getByText('Продолжить')).toBeDisabled();
  expect(
    read.calls.filter((c) => c.label === 'complete_trainer_onboarding'),
  ).toHaveLength(0);
  await fireEvent.press(screen.getByText('пн'));
  await fireEvent.press(screen.getByLabelText('Пропустить'));
  await waitFor(() =>
    expect(screen.getByText('Всё готово, Synthetic trainer!')).toBeTruthy(),
  );
});

test.each(['success', 'error'])(
  'late invitation sign-out %s cannot navigate or unlock a new form',
  async (kind) => {
    const pending = deferred<void>();
    jest.mocked(authService.signOut).mockReturnValue(pending.promise);
    const read = setupOnboarding({ first: true });
    const view = await render(<OnboardingRoute />);
    await waitFor(() =>
      expect(screen.getByText('У меня приглашение от тренера')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('У меня приглашение от тренера'));
    await fireEvent.press(screen.getByText('Сменить аккаунт'));
    await fireEvent.press(screen.getByText('Сменить аккаунт'));
    expect(authService.signOut).toHaveBeenCalledTimes(1);
    mockSession = session(anotherLogin);
    await act(async () => read.emit('SIGNED_IN', mockSession));
    await view.rerender(<OnboardingRoute />);
    await waitFor(() =>
      expect(screen.getByText('Я тренер — начать')).toBeTruthy(),
    );
    await act(async () => {
      if (kind === 'success') pending.resolve();
      else pending.reject(new Error('late sign-out'));
    });
    expect(router.replace).not.toHaveBeenCalled();
    await goToClient();
    expect(screen.getByText('Добавлю позже')).not.toBeDisabled();
  },
);

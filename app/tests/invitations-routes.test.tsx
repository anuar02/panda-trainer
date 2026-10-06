import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Share, Text as MockText } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { getSupabaseClient } from '../src/features/auth/client';
import { authStorage } from '../src/features/auth/storage';
import InvitationRoute from '../app/invite/[token]';
import TrainerInvitationRoute from '../app/workspace/invite/[id]';
import { pendingInvitationToken } from '../src/features/invitations/pending';
import {
  accepted,
  actor,
  cardId,
  deferred,
  harness,
  invitationId,
  issued,
  secret,
  session,
  workspace,
} from './invitation-harness';
import '../src/lib/i18n';

let mockSession: ReturnType<typeof session> | null = session();
let mockToken: string | string[] = secret;
let mockWorkspace = workspace;
let mockClient = cardId;
const mockToast = jest.fn();
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/auth/provider', () => ({
  useAuth: () => ({ session: mockSession, loading: false, failed: false }),
}));
jest.mock('../src/features/auth/storage', () => ({
  authStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('../src/features/onboarding/use-onboarding-context', () => ({
  useOnboardingContext: () => ({
    context: { workspace: { id: mockWorkspace } },
    loading: false,
    failed: false,
  }),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
  randomUUID: jest.fn(),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('../src/ui/mascot', () => ({ Mascot: () => null }));
jest.mock('../src/ui/toast', () => ({ useToast: () => mockToast }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Redirect: ({ href }: { href: string }) => <MockText>{href}</MockText>,
  useLocalSearchParams: () => ({ token: mockToken, id: mockClient }),
}));
let saved: string | null = null;
beforeEach(() => {
  mockSession = session();
  mockToken = secret;
  mockWorkspace = workspace;
  mockClient = cardId;
  saved = null;
  jest.clearAllMocks();
  jest.mocked(authStorage.getItem).mockImplementation(async () => saved);
  jest.mocked(authStorage.setItem).mockImplementation(async (_key, value) => {
    saved = value;
  });
  jest.mocked(authStorage.removeItem).mockImplementation(async () => {
    saved = null;
  });
  jest
    .mocked(Crypto.getRandomBytesAsync)
    .mockResolvedValue(Uint8Array.from({ length: 32 }, (_, i) => i));
  jest.mocked(Crypto.randomUUID).mockReturnValue(invitationId);
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
});
const ready = () =>
  waitFor(() => expect(screen.getByText('Подключиться')).toBeTruthy());

it('cold anonymous route preserves secure intent through login and waits for explicit acceptance', async () => {
  const h = harness();
  h.setSession(null);
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  mockSession = null;
  const view = await render(<InvitationRoute />);
  await waitFor(() =>
    expect(screen.getByText('Войти и подключиться')).toBeTruthy(),
  );
  expect(saved).toBe(secret);
  expect(h.rpc).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Войти и подключиться'));
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith('/auth/sign-in'),
  );
  mockSession = session();
  await act(async () => h.event('SIGNED_IN', mockSession));
  await view.rerender(<InvitationRoute />);
  await ready();
  expect(h.rpc).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Подключиться'));
  await waitFor(() =>
    expect(screen.getByText('Вы подключены к Тренер А')).toBeTruthy(),
  );
  expect(saved).toBeNull();
  await fireEvent.press(screen.getByText('Перейти в аккаунт'));
  expect(router.replace).toHaveBeenCalledWith('/auth/account');
});

it.each(['P0002', '08006'])(
  'warm route keeps terminal and transient %s errors neutral',
  async (code) => {
    const h = harness(
      jest.fn().mockResolvedValue({
        data: null,
        error: { code, message: `private ${secret}` },
      }),
    );
    jest.mocked(getSupabaseClient).mockReturnValue(h.client);
    await render(<InvitationRoute />);
    await ready();
    await fireEvent.press(screen.getByText('Подключиться'));
    await waitFor(() =>
      expect(
        screen.getByText(
          code === 'P0002'
            ? 'Приглашение недоступно'
            : 'Не удалось выполнить действие. Проверьте соединение и попробуйте ещё раз.',
        ),
      ).toBeTruthy(),
    );
    expect(saved).toBe(code === 'P0002' ? null : secret);
    expect(screen.queryByText(`private ${secret}`)).toBeNull();
  },
);

it.each(['success', 'error'] as const)(
  'late accept %s cannot publish to a new login or navigate',
  async (outcome) => {
    const wait = deferred<{ data: unknown; error: unknown }>();
    const h = harness(jest.fn(() => wait.promise));
    jest.mocked(getSupabaseClient).mockReturnValue(h.client);
    const view = await render(<InvitationRoute />);
    await ready();
    await fireEvent.press(screen.getByText('Подключиться'));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
    mockSession = session(actor, workspace);
    await act(async () => h.event('SIGNED_IN', mockSession));
    await view.rerender(<InvitationRoute />);
    await ready();
    await act(async () => {
      if (outcome === 'success') wait.resolve({ data: accepted, error: null });
      else wait.reject(new Error('private'));
    });
    expect(screen.queryByText('Вы подключены к Тренер А')).toBeNull();
    expect(
      screen.queryByText(
        'Не удалось выполнить действие. Проверьте соединение и попробуйте ещё раз.',
      ),
    ).toBeNull();
    expect(saved).toBe(secret);
    expect(router.replace).not.toHaveBeenCalled();
  },
);

it('a warm new token during acceptance is retained and old acceptance is hidden', async () => {
  const wait = deferred<{ data: unknown; error: unknown }>();
  const h = harness(jest.fn(() => wait.promise));
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  const view = await render(<InvitationRoute />);
  await ready();
  await fireEvent.press(screen.getByText('Подключиться'));
  await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
  mockToken = `${secret.slice(0, -1)}A`;
  await view.rerender(<InvitationRoute />);
  await ready();
  await act(async () => wait.resolve({ data: accepted, error: null }));
  expect(saved).toBe(mockToken);
  expect(screen.queryByText('Вы подключены к Тренер А')).toBeNull();
});

it('unmount during accept storage clear suppresses acceptance and navigation', async () => {
  const wait = deferred<void>();
  const h = harness();
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  jest.mocked(authStorage.removeItem).mockImplementation(() => wait.promise);
  const view = await render(<InvitationRoute />);
  await ready();
  await fireEvent.press(screen.getByText('Подключиться'));
  await waitFor(() => expect(authStorage.removeItem).toHaveBeenCalledTimes(1));
  await view.unmount();
  await act(async () => wait.resolve());
  expect(router.replace).not.toHaveBeenCalled();
});

it('malformed/array tokens never reach Auth or acceptance transport', async () => {
  const h = harness();
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  mockToken = [secret, secret];
  await render(<InvitationRoute />);
  expect(screen.getByText('Приглашение недоступно')).toBeTruthy();
  expect(h.rpc).not.toHaveBeenCalled();
  expect(authStorage.setItem).not.toHaveBeenCalled();
});

async function trainerReady(h: ReturnType<typeof harness>) {
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  h.read.mockImplementation(async (table) => ({
    data:
      table === 'trainer_workspaces'
        ? { id: workspace, owner_user_id: actor }
        : table === 'client_records'
          ? h.card
          : h.rpc.mock.calls.length
            ? h.invitation
            : null,
    error: null,
  }));
  const view = await render(<TrainerInvitationRoute />);
  await waitFor(() =>
    expect(screen.getByText('Создать ссылку-приглашение')).toBeTruthy(),
  );
  return view;
}
async function issueLink() {
  await fireEvent.press(screen.getByText('Создать ссылку-приглашение'));
  await waitFor(() =>
    expect(screen.getByText('Скопировать ссылку')).toBeTruthy(),
  );
}

it('trainer issue → lost response exact retry → copy/share → reissue → revoke uses production links', async () => {
  const h = harness(
    jest
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValue({ data: issued, error: null }),
  );
  await trainerReady(h);
  await fireEvent.press(screen.getByText('Создать ссылку-приглашение'));
  await waitFor(() => expect(screen.getByText('Повторить')).toBeTruthy());
  await fireEvent.press(screen.getByText('Повторить'));
  await waitFor(() =>
    expect(screen.getByText('Скопировать ссылку')).toBeTruthy(),
  );
  expect(h.rpc.mock.calls[0]).toEqual(h.rpc.mock.calls[1]);
  await fireEvent.press(screen.getByText('Скопировать ссылку'));
  await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
    `https://trainer.narutouzumaki.kz/invite/${secret}`,
  );
  const share = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: Share.sharedAction });
  await fireEvent.press(screen.getByText('Поделиться'));
  await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByText('Перевыпустить'));
  await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(3));
  await waitFor(() =>
    expect(
      screen.getByText('Отозвать ссылку').props.accessibilityState?.disabled,
    ).not.toBe(true),
  );
  h.rpc.mockResolvedValue({
    data: { invitation_id: invitationId, revoked: true, replayed: false },
    error: null,
  });
  h.invitation.revoked_at = '2026-10-01T01:00:00Z' as unknown as null;
  await fireEvent.press(screen.getByText('Отозвать ссылку'));
  await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(4));
  await waitFor(() =>
    expect(screen.getByText('Создать ссылку-приглашение')).toBeTruthy(),
  );
  share.mockRestore();
});

it('double tap while async random is pending produces one operation and old finally cannot unlock the new route', async () => {
  const h = harness(jest.fn().mockResolvedValue({ data: issued, error: null }));
  const view = await trainerReady(h);
  const bytes = deferred<Uint8Array>();
  jest.mocked(Crypto.getRandomBytesAsync).mockReturnValueOnce(bytes.promise);
  await fireEvent.press(screen.getByText('Создать ссылку-приглашение'));
  await fireEvent.press(screen.getByText('Создать ссылку-приглашение'));
  await waitFor(() =>
    expect(Crypto.getRandomBytesAsync).toHaveBeenCalledTimes(1),
  );
  mockSession = session(actor, workspace);
  await act(async () => h.event('SIGNED_IN', mockSession));
  await view.rerender(<TrainerInvitationRoute />);
  await act(async () => bytes.resolve(new Uint8Array(32)));
  await waitFor(() =>
    expect(screen.getByText('Создать ссылку-приглашение')).toBeTruthy(),
  );
  expect(h.rpc).not.toHaveBeenCalled();
});

it.each(['clipboard', 'share'] as const)(
  'late %s completion after logout cannot show old toast/error',
  async (kind) => {
    const h = harness(
      jest.fn().mockResolvedValue({ data: issued, error: null }),
    );
    const view = await trainerReady(h);
    await issueLink();
    const wait = deferred<boolean>();
    const shareWait = deferred<Awaited<ReturnType<typeof Share.share>>>();
    jest.mocked(Clipboard.setStringAsync).mockReturnValue(wait.promise);
    const share = jest.spyOn(Share, 'share').mockReturnValue(shareWait.promise);
    await fireEvent.press(
      screen.getByText(
        kind === 'clipboard' ? 'Скопировать ссылку' : 'Поделиться',
      ),
    );
    await waitFor(() =>
      expect(
        kind === 'clipboard' ? Clipboard.setStringAsync : share,
      ).toHaveBeenCalledTimes(1),
    );
    mockSession = null;
    await act(async () => h.event('SIGNED_OUT', null));
    await view.rerender(<TrainerInvitationRoute />);
    await act(async () => {
      wait.resolve(true);
      if (kind === 'share') shareWait.reject(new Error('private'));
      else shareWait.resolve({ action: Share.sharedAction });
    });
    expect(mockToast).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        'Не удалось выполнить действие. Проверьте соединение и попробуйте ещё раз.',
      ),
    ).toBeNull();
    share.mockRestore();
  },
);

it('new pending queued during clear is preserved even when it repeats the same token', async () => {
  await pendingInvitationToken.set(secret);
  const read = deferred<string | null>();
  jest.mocked(authStorage.getItem).mockReturnValueOnce(read.promise);
  const clearing = pendingInvitationToken.clear(secret);
  await waitFor(() => expect(authStorage.getItem).toHaveBeenCalledTimes(1));
  const newer = pendingInvitationToken.set(secret);
  read.resolve(secret);
  await expect(clearing).resolves.toBe(false);
  await newer;
  expect(saved).toBe(secret);
  expect(authStorage.removeItem).not.toHaveBeenCalled();
});

it('a new command with the identical token during RPC cannot be cleared by the old accept', async () => {
  const wait = deferred<{ data: unknown; error: unknown }>();
  const h = harness(jest.fn(() => wait.promise));
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  await render(<InvitationRoute />);
  await ready();
  await fireEvent.press(screen.getByText('Подключиться'));
  await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
  await pendingInvitationToken.set(secret);
  await act(async () => wait.resolve({ data: accepted, error: null }));
  expect(saved).toBe(secret);
  expect(screen.queryByText('Вы подключены к Тренер А')).toBeNull();
  expect(authStorage.removeItem).not.toHaveBeenCalled();
});

it('terminal unavailable and malformed links can leave after their intent has been cleared', async () => {
  const h = harness(
    jest.fn().mockResolvedValue({ data: null, error: { code: 'P0002' } }),
  );
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  await render(<InvitationRoute />);
  await ready();
  await fireEvent.press(screen.getByText('Подключиться'));
  await waitFor(() => expect(screen.getByText('Понятно')).toBeTruthy());
  await fireEvent.press(screen.getByText('Понятно'));
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith('/auth/account'),
  );
});

it.each(['clipboard', 'share'] as const)(
  'a session switch during the guard prevents entering the native %s API',
  async (kind) => {
    const h = harness(
      jest.fn().mockResolvedValue({ data: issued, error: null }),
    );
    const view = await trainerReady(h);
    await issueLink();
    const wait = deferred<unknown>();
    h.getSession.mockImplementationOnce(async () => {
      await wait.promise;
      return { data: { session: session() }, error: null };
    });
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction });
    await fireEvent.press(
      screen.getByText(
        kind === 'clipboard' ? 'Скопировать ссылку' : 'Поделиться',
      ),
    );
    mockSession = session(actor, workspace);
    await act(async () => h.event('SIGNED_IN', mockSession));
    await view.rerender(<TrainerInvitationRoute />);
    await act(async () => wait.resolve(undefined));
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    share.mockRestore();
  },
);

it('late anonymous sign-in storage completion cannot navigate a new pending command', async () => {
  const h = harness();
  h.setSession(null);
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  mockSession = null;
  await render(<InvitationRoute />);
  await waitFor(() =>
    expect(screen.getByText('Войти и подключиться')).toBeTruthy(),
  );
  const wait = deferred<void>();
  jest.mocked(authStorage.setItem).mockImplementationOnce(() => wait.promise);
  await fireEvent.press(screen.getByText('Войти и подключиться'));
  await waitFor(() => expect(authStorage.setItem).toHaveBeenCalledTimes(2));
  const newerToken = `${secret.slice(0, -1)}A`;
  const newIntent = pendingInvitationToken.set(newerToken);
  await act(async () => wait.resolve());
  await newIntent;
  expect(saved).toBe(newerToken);
  expect(router.push).not.toHaveBeenCalled();
});

it('a malformed route can leave without deleting a different protected pending intent', async () => {
  const h = harness();
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  await pendingInvitationToken.set(secret);
  mockToken = 'malformed';
  await render(<InvitationRoute />);
  await fireEvent.press(screen.getByText('Понятно'));
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith('/auth/account'),
  );
  expect(saved).toBe(secret);
  expect(authStorage.removeItem).not.toHaveBeenCalled();
});

it('late accept errors from a silently changed Auth session are suppressed', async () => {
  const wait = deferred<{ data: unknown; error: unknown }>();
  const h = harness(jest.fn(() => wait.promise));
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  await render(<InvitationRoute />);
  await ready();
  await fireEvent.press(screen.getByText('Подключиться'));
  await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
  h.setSession(session(actor, workspace));
  await act(async () => wait.reject(new Error('private')));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(saved).toBe(secret);
  expect(router.replace).not.toHaveBeenCalled();
});

it.each(['clipboard', 'share'] as const)(
  'native %s rejection is guarded against a silently changed Auth session',
  async (kind) => {
    const h = harness(
      jest.fn().mockResolvedValue({ data: issued, error: null }),
    );
    await trainerReady(h);
    await issueLink();
    const clipboard = deferred<boolean>();
    const sharing = deferred<Awaited<ReturnType<typeof Share.share>>>();
    jest.mocked(Clipboard.setStringAsync).mockReturnValue(clipboard.promise);
    const share = jest.spyOn(Share, 'share').mockReturnValue(sharing.promise);
    await fireEvent.press(
      screen.getByText(
        kind === 'clipboard' ? 'Скопировать ссылку' : 'Поделиться',
      ),
    );
    await waitFor(() =>
      expect(
        kind === 'clipboard' ? Clipboard.setStringAsync : share,
      ).toHaveBeenCalledTimes(1),
    );
    h.setSession(session(actor, workspace));
    await act(async () => {
      if (kind === 'clipboard') clipboard.reject(new Error('private'));
      else sharing.reject(new Error('private'));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockToast).not.toHaveBeenCalled();
    share.mockRestore();
  },
);

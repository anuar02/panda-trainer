import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import '@/lib/i18n';
import { AccountExportControls } from '@/features/account-export/controls';
import { getSupabaseClient } from '@/features/auth/client';
import { saveExportFile } from '@/features/account-export/file';
import snapshot from './snapshot.json';

jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('@/features/account-export/file', () => ({
  saveExportFile: jest.fn(),
}));
const scope = {
  userId: snapshot.owner_user_id,
  workspaceId: snapshot.workspace_id,
  token: 'synthetic',
};
let listener: (event: AuthChangeEvent, session: Session | null) => void;
const unsubscribe = jest.fn();
let response: unknown = snapshot;
beforeEach(() => {
  response = snapshot;
  jest.mocked(saveExportFile).mockReset().mockResolvedValue('shared');
  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session: { user: { id: scope.userId }, access_token: scope.token },
        },
        error: null,
      }),
      onAuthStateChange: (callback: typeof listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe } } };
      },
    },
    rpc: async () => ({ data: response, error: null, status: 200 }),
  };
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue(client as unknown as ReturnType<typeof getSupabaseClient>);
});
test('localized two-step controls show pending limitation and truthful share result', async () => {
  await render(<AccountExportControls scope={scope} />);
  expect(screen.getByText(/Несинхронизированные записи/)).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Получить экспорт' }),
  );
  expect(screen.getByRole('button', { name: 'Сохранить JSON' })).toBeTruthy();
  expect(saveExportFile).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Сохранить JSON' }));
  expect(
    screen.getByText(/Сохранение получателем не подтверждено/),
  ).toBeTruthy();
  expect(saveExportFile).toHaveBeenCalledWith(
    JSON.stringify(snapshot),
    scope,
    expect.any(Function),
  );
});
test('malformed payload has localized retry and cannot save', async () => {
  await render(<AccountExportControls scope={scope} />);
  response = { ...snapshot, collections: {} };
  await fireEvent.press(
    screen.getByRole('button', { name: 'Получить экспорт' }),
  );
  expect(screen.getByText(/Сервер вернул некорректный снимок/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Сохранить JSON' })).toBeNull();
  response = snapshot;
  await fireEvent.press(
    screen.getByRole('button', { name: 'Получить экспорт повторно' }),
  );
  expect(screen.getByRole('button', { name: 'Сохранить JSON' })).toBeTruthy();
});
test('logout immediately hides ready snapshot and disables stale controller', async () => {
  const view = await render(<AccountExportControls scope={scope} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Получить экспорт' }),
  );
  await act(async () => listener('SIGNED_OUT', null));
  expect(screen.queryByRole('button', { name: 'Сохранить JSON' })).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Получить экспорт повторно' }),
  ).toBeDisabled();
  expect(saveExportFile).not.toHaveBeenCalled();
  await view.unmount();
  expect(unsubscribe).toHaveBeenCalled();
});
test('workspace prop switch clears old status and file', async () => {
  const view = await render(<AccountExportControls scope={scope} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Получить экспорт' }),
  );
  await view.rerender(
    <AccountExportControls
      scope={{ ...scope, workspaceId: '00000000-0000-4000-8000-000000000098' }}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Сохранить JSON' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Получить экспорт' })).toBeTruthy();
  expect(saveExportFile).not.toHaveBeenCalled();
});

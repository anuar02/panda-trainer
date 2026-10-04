import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NotificationEntry } from '@/features/notifications/feed';
import { useNotifications } from '@/features/notifications/use-notifications';
import { scope, row, deferred } from './fixtures';
import type { ReactNode } from 'react';
import '@/lib/i18n';
import { router } from 'expo-router';
jest.mock('@/features/notifications/use-notifications', () => ({
  useNotifications: jest.fn(),
}));
jest.mock('expo-router', () => {
  const router = { push: jest.fn() };
  return { router, useRouter: () => router };
});
jest.mock('@/ui/sheet', () => ({
  Sheet: ({
    open,
    title,
    children,
    onClose,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
    onClose: () => void;
  }) => {
    const { Text, View, Pressable } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return open ? (
      <View>
        <Text>{title}</Text>
        {children}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text>Close</Text>
        </Pressable>
      </View>
    ) : null;
  },
}));
function fixture(overrides: Partial<ReturnType<typeof useNotifications>> = {}) {
  const value = {
    scopeKey: 'login:card',
    rows: [row()],
    unreadCount: 1,
    cursor: null,
    hasMore: false,
    loading: false,
    failed: false,
    busy: false,
    retry: jest.fn(),
    more: jest.fn(),
    mark: jest.fn(async () => true),
    target: jest.fn(async () => ({
      available: true,
      type: 'booking' as const,
      id: row().target_id,
      clientRecordId: scope.clientRecordId!,
      current: {
        status: 'confirmed',
        date: '2026-10-10',
        startsAt: '2026-10-10T10:00:00Z',
      },
    })),
    ...overrides,
  };
  jest.mocked(useNotifications).mockReturnValue(value);
  return value;
}
afterEach(() => jest.resetAllMocks());
async function open() {
  await fireEvent.press(screen.getByRole('button', { name: /Уведомления/ }));
}
test.each(['client', 'trainer'] as const)(
  'real %s feed shows exact count, read action and explicit own target',
  async (role) => {
    const f = fixture();
    await render(<NotificationEntry {...scope} role={role} />);
    expect(screen.getByTestId('notification-count')).toHaveTextContent('1');
    await open();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Отметить прочитанным' }),
    );
    expect(f.mark).toHaveBeenCalledWith(row().id);
    expect(router.push).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Открыть актуальное' }),
    );
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname:
          role === 'client'
            ? '/connection/[clientRecordId]'
            : '/workspace/schedule',
      }),
    );
  },
);
test('empty/loading/error/retry/more states never invent zero count or success', async () => {
  const f = fixture({ rows: [], unreadCount: null, loading: true });
  const view = await render(<NotificationEntry {...scope} />);
  await open();
  expect(screen.getByText('Загружаем…')).toBeTruthy();
  fixture({
    rows: [],
    unreadCount: null,
    failed: true,
    loading: false,
    retry: f.retry,
  });
  await view.rerender(<NotificationEntry {...scope} />);
  expect(screen.getByText('Счётчик недоступен')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  );
  expect(f.retry).toHaveBeenCalled();
  fixture({ rows: [], unreadCount: 0 });
  await view.rerender(<NotificationEntry {...scope} />);
  expect(screen.getByText(/Открытых запросов нет/)).toBeTruthy();
  fixture({ hasMore: true, more: f.more });
  await view.rerender(<NotificationEntry {...scope} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Показать ещё' }));
  expect(f.more).toHaveBeenCalled();
});
test('deleted/cancelled target honest, opening does not mark or repeat scheduling action', async () => {
  const f = fixture();
  jest.mocked(f.target).mockResolvedValueOnce({
    available: false,
    type: 'booking',
    id: row().target_id,
    clientRecordId: scope.clientRecordId!,
    current: null,
  });
  await render(<NotificationEntry {...scope} />);
  await open();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Открыть актуальное' }),
  );
  expect(screen.getByText(/Объект больше недоступен/)).toBeTruthy();
  expect(f.mark).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});
test('close/unmount and scope switch fence deferred target results and errors', async () => {
  const pending =
    deferred<
      Awaited<ReturnType<ReturnType<typeof useNotifications>['target']>>
    >();
  fixture({ target: () => pending.promise });
  const view = await render(<NotificationEntry {...scope} />);
  await open();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Открыть актуальное' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  await act(async () => pending.reject(new Error('late')));
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.queryByText(/Объект больше недоступен/)).toBeNull();
  fixture({ scopeKey: 'new-login', rows: [], unreadCount: null });
  await view.rerender(<NotificationEntry {...scope} />);
  expect(screen.queryByText('Открыть актуальное')).toBeNull();
  await view.unmount();
});

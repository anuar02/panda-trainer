import type { PropsWithChildren } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { TrainerTodayScreen } from '../src/features/trainer-today/trainer-today-screen';

jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

test('past sessions expand and collapse without changing the current group', async () => {
  await render(<TrainerTodayScreen />);
  expect(screen.queryByText('09:00')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: /Прошло 5 занятий/ }),
  );
  expect(screen.getByText('09:00')).toBeTruthy();
  expect(screen.getByText('Мини-группа')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: /Прошло 5 занятий/ }),
  );
  expect(screen.queryByText('09:00')).toBeNull();
});

test('group participants open with all original attendance unmarked', async () => {
  await render(<TrainerTodayScreen />);
  await fireEvent.press(
    screen.getByRole('button', { name: /Участники мини-группы/ }),
  );
  expect(screen.getByText('Алия Нурлановa')).toBeTruthy();
  expect(screen.getByText('Мади Касымов')).toBeTruthy();
  expect(screen.getByText('Дана Ержанова')).toBeTruthy();
  expect(screen.getAllByText('Пока не отмечено')).toHaveLength(3);
  expect(
    screen
      .getAllByRole('button', { name: 'Пришёл' })
      .every((button) => button.props.accessibilityState.disabled),
  ).toBe(true);
});

test('empty and loading omit bookings, offline preserves cached day', async () => {
  const view = await render(<TrainerTodayScreen scenario="empty" />);
  expect(screen.getByText('Сегодня занятий нет')).toBeTruthy();
  expect(screen.queryByText('Мини-группа')).toBeNull();
  await view.rerender(<TrainerTodayScreen scenario="loading" />);
  expect(screen.getByTestId('trainer-today-loading')).toBeTruthy();
  expect(screen.queryByText('Сегодня занятий нет')).toBeNull();
  await view.rerender(<TrainerTodayScreen scenario="offline" />);
  expect(
    screen.getByText(
      'Нет связи. Показано из последней загрузки, изменения могут быть не отправлены.',
    ),
  ).toBeTruthy();
  expect(screen.getByText('Мини-группа')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Создать занятие' }).props
      .accessibilityState.disabled,
  ).toBe(true);
});

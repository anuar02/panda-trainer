import type { PropsWithChildren } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { TrainerLibraryScreen } from '../src/features/trainer-library/trainer-library-screen';

jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

test.each(['normal', 'empty', 'loading', 'offline'] as const)(
  'canonical library retains catalog in %s scenario',
  async (scenario) => {
    await render(<TrainerLibraryScreen scenario={scenario} />);
    expect(screen.getByTestId(`trainer-library-${scenario}`)).toBeTruthy();
    expect(screen.getByText('81 упражнение')).toBeTruthy();
  },
);

test('search uses aliases, ignores ё, and resets empty results', async () => {
  await render(<TrainerLibraryScreen />);
  await fireEvent.changeText(
    screen.getByLabelText('Поиск упражнений'),
    'barbell bench press',
  );
  expect(screen.getByText('Жим лёжа')).toBeTruthy();
  expect(screen.getByText('1 упражнение')).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText('Поиск упражнений'),
    'несуществующее',
  );
  expect(screen.getByText('Ничего не нашлось')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Показать все упражнения' }),
  );
  expect(screen.getByText('81 упражнение')).toBeTruthy();
});

test('favorites and technique filter compose locally', async () => {
  await render(<TrainerLibraryScreen />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'В избранное: Выпады с гантелями' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Избранное' }));
  expect(screen.getByText('1 упражнение')).toBeTruthy();
  expect(screen.getByText('Выпады с гантелями')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'С техникой' }));
  expect(screen.getByText('1 упражнение')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Убрать из избранного: Выпады с гантелями',
    }),
  );
  expect(screen.getByText('Пока нет избранных упражнений')).toBeTruthy();
});

test('template search opens exact plan and disables unavailable writes', async () => {
  await render(<TrainerLibraryScreen />);
  await fireEvent.press(screen.getByText('Шаблоны'));
  expect(screen.getByRole('button', { name: 'Создать шаблон' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Поиск шаблонов'), 'Сила');
  await fireEvent.press(screen.getByText('Сила 5×5'));
  expect(screen.getByText('11 подходов')).toBeTruthy();
  expect(screen.getByText('5 × 5 · 100 кг')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Изменить' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Создать занятие с этим планом' }),
  ).toBeDisabled();
});

test('muscle and equipment filters compose and technique details use the selected exercise', async () => {
  await render(<TrainerLibraryScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Ноги' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Оборудование' }));
  await fireEvent.press(screen.getByRole('button', { name: 'гантели' }));
  expect(screen.getByText('2 упражнения')).toBeTruthy();
  await fireEvent.press(screen.getByText('Выпады с гантелями'));
  expect(screen.getByText('Как выполнять')).toBeTruthy();
  expect(
    screen.getByText(
      '1. Встаньте, ноги на ширине плеч, держа в каждой руке по гантели.',
    ),
  ).toBeTruthy();
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  ClientDetailsScreen,
  type ClientDetailsProps,
} from '../src/features/client-details/client-details-screen';
import { workoutSessions } from '../src/domain/workout/fixtures';
import { createWorkoutState, workoutReducer } from '../src/domain/workout';
import { i18n } from '../src/lib/i18n';
import { clientDetails } from '../src/features/client-details/ru';

jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
beforeAll(() => {
  i18n.addResourceBundle('ru', 'translation', { clientDetails }, true, true);
});
const props = (): ClientDetailsProps => ({
  clientId: 'c1',
  sessions: workoutSessions,
  onBack: jest.fn(),
  onOpenSession: jest.fn(),
  onCreateSession: jest.fn(),
  onOpenLibrary: jest.fn(),
});

test('filters sessions by client, opens selected client and resets tabs when identity changes', async () => {
  const callbacks = props();
  const view = await render(<ClientDetailsScreen {...callbacks} />);
  expect(screen.getByText('Айгерим Бекова')).toBeTruthy();
  expect(screen.queryByTestId('client-session-s1')).toBeNull();
  await fireEvent.press(screen.getByTestId('client-session-s4'));
  expect(callbacks.onOpenSession).toHaveBeenCalledWith('s4', 'c1');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Создать занятие' }),
  );
  expect(callbacks.onCreateSession).toHaveBeenCalledWith('c1');
  await fireEvent.press(screen.getByRole('tab', { name: 'Заметки' }));
  expect(
    screen.getByText('Правое колено — не больше 90°, следить за разминкой.'),
  ).toBeTruthy();
  await view.rerender(<ClientDetailsScreen {...callbacks} clientId="c2" />);
  expect(screen.getByRole('tab', { name: 'Занятия' })).toBeSelected();
  expect(screen.queryByTestId('client-session-s4')).toBeNull();
  expect(screen.getByTestId('client-session-s3')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Заметки' }));
  expect(
    screen.queryByText('Правое колено — не больше 90°, следить за разминкой.'),
  ).toBeNull();
  expect(
    screen.getByText('Поясница — не добавлять вес без страховки.'),
  ).toBeTruthy();
});

test('canonical program, history exercise switching, billing and disabled actions', async () => {
  await render(<ClientDetailsScreen {...props()} />);
  expect(screen.getByRole('button', { name: 'Действия' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('tab', { name: 'Программа' }));
  expect(screen.getByText('Приседания со штангой')).toBeTruthy();
  expect(screen.getByText('4 × 8 · 80 кг')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Прогресс' }));
  expect(screen.getAllByText('82,5')).toHaveLength(2);
  await fireEvent.press(screen.getByRole('button', { name: 'Румынская тяга' }));
  expect(screen.getByText('+5 кг с 19 авг')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Оплаты' }));
  expect(
    screen.getByRole('button', { name: 'Записать оплату' }),
  ).toBeDisabled();
  expect(screen.getByText('12 · использовано 5')).toBeTruthy();
  expect(screen.getByText('28 августа · Kaspi · Первая часть')).toBeTruthy();
});

test.each(['c6', 'c7'])(
  'new client %s empty panels never leak another client fixtures',
  async (clientId) => {
    const callbacks = props();
    await render(<ClientDetailsScreen {...callbacks} clientId={clientId} />);
    if (clientId === 'c6')
      expect(screen.getByRole('button', { name: 'Пригласить' })).toBeDisabled();
    expect(screen.getByText('Нет занятий')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Программа' }));
    expect(screen.getByText('Программы нет')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Открыть библиотеку' }),
    );
    expect(callbacks.onOpenLibrary).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('tab', { name: 'Прогресс' }));
    expect(screen.getByText('Пока нет данных')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Оплаты' }));
    expect(screen.getByText('Покупок нет')).toBeTruthy();
  },
);

test('finished results and existing private notes are client scoped and preserve balance', async () => {
  let state = workoutReducer(createWorkoutState(), {
    type: 'open',
    sessionId: 's6',
    participantId: 'c3',
  });
  state = workoutReducer(state, {
    type: 'save',
    clientId: 'c3',
    exerciseId: 'e1',
    setIndex: 0,
    value: { kg: 88, reps: 8 },
  });
  state = workoutReducer(state, {
    type: 'addNote',
    clientId: 'c3',
    text: 'Личная заметка Алии',
    at: '20:15',
  });
  const callbacks = props();
  const view = await render(
    <ClientDetailsScreen {...callbacks} clientId="c3" workoutState={state} />,
  );
  await fireEvent.press(screen.getByRole('tab', { name: 'Прогресс' }));
  expect(screen.getByText('Пока нет данных')).toBeTruthy();
  state = workoutReducer(state, { type: 'finish' });
  state = workoutReducer(state, { type: 'confirmPartial' });
  await view.rerender(
    <ClientDetailsScreen {...callbacks} clientId="c3" workoutState={state} />,
  );
  expect(screen.getAllByText('88')).toHaveLength(2);
  expect(screen.getByText('9')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Заметки' }));
  expect(screen.getByText('Личная заметка Алии')).toBeTruthy();
  await fireEvent.press(screen.getByText('Личная заметка Алии'));
  expect(callbacks.onOpenSession).toHaveBeenCalledWith('s6', 'c3');
  await view.rerender(
    <ClientDetailsScreen {...callbacks} clientId="c5" workoutState={state} />,
  );
  await fireEvent.press(screen.getByRole('tab', { name: 'Прогресс' }));
  expect(screen.queryByText('88')).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'Заметки' }));
  expect(screen.queryByText('Личная заметка Алии')).toBeNull();
});

test('loading, offline, missing client and agreement states are honest', async () => {
  const callbacks = props();
  const view = await render(
    <ClientDetailsScreen {...callbacks} scenario="loading" />,
  );
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка карточки клиента' }),
  ).toBeTruthy();
  expect(screen.queryByText('Айгерим Бекова')).toBeNull();
  await view.rerender(
    <ClientDetailsScreen
      {...callbacks}
      scenario="offline"
      sessions={workoutSessions.map((session) => ({
        ...session,
        awaiting: session.id === 's4' ? 'trainer' : null,
      }))}
    />,
  );
  expect(
    screen.getByText('Нет связи. Показаны сохранённые данные.'),
  ).toBeTruthy();
  expect(screen.getByText('Ждёт вашего ответа')).toBeTruthy();
  await view.rerender(
    <ClientDetailsScreen {...callbacks} clientId="unknown" />,
  );
  expect(screen.getByText('Клиент не найден')).toBeTruthy();
  expect(screen.queryByText('Айгерим Бекова')).toBeNull();
});

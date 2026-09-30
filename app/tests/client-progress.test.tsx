import { render, screen } from '@testing-library/react-native';
import { i18n } from '../src/lib/i18n';
import { ClientProgressScreen } from '../src/features/client-progress/client-progress-screen';
import { clientProgress } from '../src/features/client-progress/ru';
import { createWorkoutState, workoutReducer } from '../src/domain/workout';
import { useOptionalWorkoutDemo } from '../src/features/workout-demo';

jest.mock('../src/features/workout-demo', () => ({
  useOptionalWorkoutDemo: jest.fn(() => null),
}));

beforeEach(() => jest.mocked(useOptionalWorkoutDemo).mockReturnValue(null));

jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

beforeAll(() => {
  i18n.addResourceBundle('ru', 'translation', { clientProgress }, true, true);
});

test('canonical progress does not fabricate completed journals or attendance', async () => {
  await render(<ClientProgressScreen />);
  expect(screen.getByText('Первые результаты — впереди')).toBeTruthy();
  expect(screen.getByText('Посещения за неделю')).toBeTruthy();
  expect(screen.getAllByLabelText(/нет отметки посещения/)).toHaveLength(7);
  expect(
    screen.getByLabelText('пн, 14 сен: нет отметки посещения'),
  ).toBeTruthy();
  expect(
    screen.getByLabelText('вс, 20 сен: нет отметки посещения'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Уведомления' })).toBeDisabled();
});

test('empty and offline preserve the canonical unrecorded week, loading hides it', async () => {
  const view = await render(<ClientProgressScreen scenario="empty" />);
  expect(screen.getAllByLabelText(/нет отметки посещения/)).toHaveLength(7);
  await view.rerender(<ClientProgressScreen scenario="offline" />);
  expect(
    screen.getByText('Нет связи. Показаны сохранённые данные.'),
  ).toBeTruthy();
  expect(screen.getByText('Первые результаты — впереди')).toBeTruthy();
  await view.rerender(<ClientProgressScreen scenario="loading" />);
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка раздела' }),
  ).toBeTruthy();
  expect(screen.queryByText('Первые результаты — впереди')).toBeNull();
  expect(screen.queryByText('Посещения за неделю')).toBeNull();
});

test('shows finished client results only, filters future results and keeps visits unmarked', async () => {
  let state = workoutReducer(createWorkoutState(), {
    type: 'open',
    sessionId: 's4',
  });
  state = workoutReducer(state, {
    type: 'save',
    clientId: 'c1',
    exerciseId: 'e1',
    setIndex: 0,
    value: { kg: 85, reps: 8 },
  });
  const demo = {
    state,
    hydrated: true,
    readError: false,
    storageStatus: 'saved' as const,
    dispatch: jest.fn(),
    retrySave: jest.fn(),
  };
  jest.mocked(useOptionalWorkoutDemo).mockReturnValue(demo);
  const view = await render(<ClientProgressScreen />);
  expect(screen.getByText('Первые результаты — впереди')).toBeTruthy();
  state = workoutReducer(state, { type: 'finish' });
  state = workoutReducer(state, { type: 'confirmPartial' });
  for (const [sessionId, clientId] of [
    ['s1', 'c5'],
    ['s8', 'c1'],
  ] as const) {
    state = workoutReducer(state, { type: 'open', sessionId });
    state = workoutReducer(state, {
      type: 'save',
      clientId,
      exerciseId: 'e1',
      setIndex: 0,
      value: { kg: 150, reps: 10 },
    });
    state = workoutReducer(state, { type: 'finish' });
    state = workoutReducer(state, { type: 'confirmPartial' });
  }
  jest.mocked(useOptionalWorkoutDemo).mockReturnValue({ ...demo, state });
  await view.rerender(<ClientProgressScreen scenario="offline" />);
  expect(screen.getByText('85 кг × 8 повт')).toBeTruthy();
  expect(screen.queryByText(/150 кг/)).toBeNull();
  expect(
    screen.getByText('Для сравнения за 4 недели пока мало записей'),
  ).toBeTruthy();
  expect(screen.getAllByLabelText(/нет отметки посещения/)).toHaveLength(7);
  await view.rerender(<ClientProgressScreen scenario="empty" />);
  expect(screen.queryByText('85 кг × 8 повт')).toBeNull();
  expect(screen.getByText('Первые результаты — впереди')).toBeTruthy();
  jest
    .mocked(useOptionalWorkoutDemo)
    .mockReturnValue({ ...demo, state, hydrated: false });
  await view.rerender(<ClientProgressScreen />);
  expect(screen.getByRole('progressbar')).toBeTruthy();
  expect(screen.queryByText('85 кг × 8 повт')).toBeNull();
});

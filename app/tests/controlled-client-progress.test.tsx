import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import '../src/lib/i18n';
import {
  ClientProgressScreen,
  type ClientProgressData,
} from '../src/features/client-progress/client-progress-screen';
jest.mock('../src/features/workout-demo', () => ({
  useOptionalWorkoutDemo: () => ({ hydrated: false }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
const data: ClientProgressData = {
  trainerName: 'Actual trainer',
  results: [
    {
      name: 'Own historical exercise',
      unit: 'повт',
      best: { kg: 25.5, reps: 8, date: '2030-10-02' },
      delta: 2.5,
      deltaUnit: 'кг',
      baselineDate: '2030-09-01',
      series: [
        { date: '2030-09-01', value: 23 },
        { date: '2030-10-02', value: 25.5 },
      ],
    },
    {
      name: 'Own timed exercise',
      unit: 'сек',
      best: { kg: 0, reps: 30, date: '2030-10-02' },
      delta: null,
      deltaUnit: 'сек',
      baselineDate: null,
      series: [{ date: '2030-10-02', value: 30 }],
    },
  ],
};
test('controlled actual best cards match prototype without invented visits or chart selector', async () => {
  await render(<ClientProgressScreen data={data} />);
  expect(screen.getByText('Actual trainer')).toBeTruthy();
  expect(screen.getByText('Own historical exercise')).toBeTruthy();
  expect(screen.getByText('25,5 кг × 8 повт')).toBeTruthy();
  expect(screen.getByText('+2,5 кг за 4 недели')).toBeTruthy();
  expect(screen.getByText('30 сек')).toBeTruthy();
  expect(
    screen.getByText('Для сравнения за 4 недели пока мало записей'),
  ).toBeTruthy();
  expect(screen.queryByText('Посещения за неделю')).toBeNull();
  expect(screen.queryByText('Данияр')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Own historical exercise' }),
  ).toBeNull();
});
test('controlled loading hides cached result cards while footer remains explicit', async () => {
  await render(
    <ClientProgressScreen
      data={{ ...data, loading: true, footer: <Text>Actual read retry</Text> }}
    />,
  );
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка раздела' }),
  ).toBeTruthy();
  expect(screen.queryByText('Own historical exercise')).toBeNull();
  expect(screen.getByText('Actual read retry')).toBeTruthy();
});
test('controlled empty ignores demo offline scenario and never shows attendance placeholders', async () => {
  await render(
    <ClientProgressScreen scenario="offline" data={{ ...data, results: [] }} />,
  );
  expect(screen.getByText('Первые результаты — впереди')).toBeTruthy();
  expect(
    screen.queryByText('Нет связи. Показаны сохранённые данные.'),
  ).toBeNull();
  expect(screen.queryByText('Посещения за неделю')).toBeNull();
  expect(screen.queryByText('Own historical exercise')).toBeNull();
});

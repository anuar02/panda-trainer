import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { ClientConnectedProgressScreen } from '../src/features/client-progress/client-connected-progress-screen';
import { useClientProgress } from '../src/features/client-progress/use-progress';
import type { ClientProgressHistory } from '../src/features/client-progress/service';
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
}));
jest.mock('../src/features/client-home/use-overview', () => ({
  useClientOverview: () => ({
    data: null,
    loading: true,
    error: null,
    retry: jest.fn(),
  }),
}));
jest.mock('../src/ui/sheet', () => ({ Sheet: () => null }));
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/client-progress/use-progress', () => ({
  useClientProgress: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/use-clock', () => ({
  useWorkspaceClock: () => new Date('2030-10-02T06:00:00Z'),
}));
jest.mock('../src/features/workout-demo', () => ({
  useOptionalWorkoutDemo: () => ({ hydrated: false }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
const first = {
  id: 'first-journal',
  bookingId: 'first-booking',
  startedAtUtc: '2030-09-01T05:00:00Z',
  finishedAtUtc: '2030-09-01T06:00:00Z',
  revision: 1,
  exercises: [
    {
      id: 'snapshot',
      exerciseId: 'source',
      name: 'Own immutable squat',
      measure: 'reps' as const,
      bodyweight: false,
      muscleGroup: 'legs',
      equipment: 'barbell',
      instructions: [],
      position: 0,
      plannedSets: 3,
      plannedReps: '99',
      plannedSeconds: null,
      plannedWeightG: 99000,
      restSeconds: 60,
      replacedFromId: null,
      skipped: false,
      revision: 1,
      sets: [
        {
          id: 'first-result',
          position: 0,
          reps: 8,
          seconds: null,
          weightG: 20000,
          revision: 1,
        },
      ],
    },
  ],
  notes: [],
};
const data: ClientProgressHistory = {
  context: {
    clientRecordId: 'card',
    workspaceId: 'workspace',
    clientName: 'Own client',
    trainerName: 'Own trainer',
    timezone: 'Asia/Almaty',
  },
  nextOffset: null,
  journals: [
    first,
    {
      ...first,
      id: 'latest-journal',
      bookingId: 'latest-booking',
      startedAtUtc: '2030-10-02T05:00:00Z',
      finishedAtUtc: '2030-10-02T05:30:00Z',
      exercises: [
        {
          ...first.exercises[0]!,
          id: 'latest-snapshot',
          sets: [
            {
              id: 'latest-result',
              position: 0,
              reps: 5,
              seconds: null,
              weightG: 25500,
              revision: 1,
            },
          ],
        },
      ],
    },
  ],
};
const props = {
  userId: 'user',
  workspaceId: 'workspace',
  clientRecordId: 'card',
  trainerName: 'Fallback trainer',
};
const read = jest.mocked(useClientProgress),
  retry = jest.fn();
const state = () => ({ data, loading: false, error: null, retry });
beforeEach(() => {
  jest.clearAllMocks();
  read.mockReturnValue(state());
});
test('complete own history derives actual best and four-week delta without fake attendance or chart controls', async () => {
  await render(<ClientConnectedProgressScreen {...props} />);
  expect(screen.getByText('Own trainer')).toBeTruthy();
  expect(screen.getByText('Own immutable squat')).toBeTruthy();
  expect(screen.getByText('25,5 кг × 5 повт')).toBeTruthy();
  expect(screen.getByText('+5,5 кг за 4 недели')).toBeTruthy();
  expect(screen.getByText('Посещения за неделю')).toBeTruthy();
  expect(screen.queryByText('99 кг')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Own immutable squat' }),
  ).toBeNull();
  expect(read).toHaveBeenCalledWith({
    userId: 'user',
    clientRecordId: 'card',
    workspaceId: 'workspace',
  });
});
test('loading hides historical cached metrics and never falls back to demo', async () => {
  read.mockReturnValue({ ...state(), loading: true });
  await render(<ClientConnectedProgressScreen {...props} />);
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка раздела' }),
  ).toBeTruthy();
  expect(screen.queryByText('Own immutable squat')).toBeNull();
  expect(screen.queryByText('Данияр')).toBeNull();
});
test('incomplete history is rejected instead of displaying partial best or baseline', async () => {
  read.mockReturnValue({
    ...state(),
    data: { ...data, nextOffset: 50 } as unknown as ClientProgressHistory,
  });
  await render(<ClientConnectedProgressScreen {...props} />);
  expect(screen.queryByText('25,5 кг × 5 повт')).toBeNull();
  expect(screen.queryByText('Own immutable squat')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});
test('read failure retries without stale metrics', async () => {
  read.mockReturnValue({ ...state(), data: null, error: 'request' });
  await render(<ClientConnectedProgressScreen {...props} />);
  expect(screen.queryByText('Own immutable squat')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});
test.each([
  { workspaceId: 'foreign', clientRecordId: 'card' },
  { workspaceId: 'workspace', clientRecordId: 'foreign' },
])('wrong returned scope %s blocks all derived results', async (scope) => {
  read.mockReturnValue({
    ...state(),
    data: { ...data, context: { ...data.context, ...scope } },
  });
  await render(<ClientConnectedProgressScreen {...props} />);
  expect(screen.queryByText('Own immutable squat')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  ).toBeTruthy();
});
test('account and selected card changes hide prior account results and pin new hook scope', async () => {
  const view = await render(<ClientConnectedProgressScreen {...props} />);
  expect(screen.getByText('25,5 кг × 5 повт')).toBeTruthy();
  read.mockReturnValue({ ...state(), data: null, loading: true });
  await view.rerender(
    <ClientConnectedProgressScreen
      {...props}
      userId="other"
      clientRecordId="other-card"
    />,
  );
  expect(screen.queryByText('25,5 кг × 5 повт')).toBeNull();
  expect(read).toHaveBeenLastCalledWith({
    userId: 'other',
    clientRecordId: 'other-card',
    workspaceId: 'workspace',
  });
});

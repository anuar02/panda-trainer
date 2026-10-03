import { fireEvent, render, screen } from '@testing-library/react-native';
import type {
  PreloadExercise,
  WorkoutPreloadContext,
} from '@/domain/workout-preload/types';
import type { PreloadState } from '@/features/workout-preload/lifecycle';
import { WorkoutPreloadScreen } from '@/features/workout-preload/screen';
import { useOptionalWorkoutPreload } from '@/features/workout-preload/provider';
import '../src/lib/i18n';

jest.mock('../src/features/workout-preload/provider', () => ({
  useOptionalWorkoutPreload: jest.fn(),
}));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('../src/features/workout-sync', () => ({
  WorkoutSyncStatus: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));

function exercise(name: string): PreloadExercise {
  return {
    id: name,
    exerciseId: name,
    name,
    measure: 'reps',
    bodyweight: false,
    muscleGroup: 'legs',
    equipment: 'barbell',
    instructions: [],
    sourceKey: null,
    skipped: false,
    replacedFromId: null,
    position: 0,
    plannedSets: 3,
    plannedReps: '8',
    plannedSeconds: null,
    plannedWeightGrams: null,
    restSeconds: 60,
    revision: 1,
    sets: [],
    previousSets: [],
  };
}
const context: WorkoutPreloadContext = {
  version: 1,
  scope: { accountId: 'account', workspaceId: 'workspace' },
  sessionKey: 'booking',
  startsAt: '2026-10-03T10:00:00Z',
  loadedAt: '2026-10-03T09:00:00Z',
  participants: [1, 2, 3].map((id) => ({
    bookingId: `booking-${id}`,
    clientRecordId: `client-${id}`,
    clientName: `Client ${id}`,
    programId: `program-${id}`,
    programName: `Program ${id}`,
    programDescription: `Description ${id}`,
    baseTemplateId: `template-${id}`,
    programRevision: 1,
    workoutId: `workout-${id}`,
    workoutRevision: 1,
    workoutStatus: 'in_progress',
    assignedExercises: [exercise(`Assigned ${id}`)],
    exercises: [
      {
        ...exercise(`Current ${id}`),
        sets: [
          {
            id: 'zero',
            revision: 1,
            position: 0,
            weightGrams: 0,
            reps: 0,
            seconds: null,
          },
          {
            id: 'unknown',
            revision: 1,
            position: 1,
            weightGrams: null,
            reps: null,
            seconds: null,
          },
        ],
      },
    ],
  })),
};
function actions(
  state: PreloadState = {
    status: 'ready',
    context,
    recovery: {
      version: 1,
      sessionKey: 'booking',
      bookingId: 'booking-2',
      clientRecordId: 'client-2',
      collapsed: false,
    },
    error: null,
    cached: true,
  },
) {
  return {
    state,
    syncState: null,
    open: jest.fn(async () => {}),
    select: jest.fn(async () => {}),
    collapse: jest.fn(async () => {}),
    resume: jest.fn(async () => {}),
    retry: jest.fn(),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
});

it('shows three participants with isolated assigned and current plans for the selected client', async () => {
  const value = actions();
  jest.mocked(useOptionalWorkoutPreload).mockReturnValue(value);
  await render(<WorkoutPreloadScreen />);
  for (const id of [1, 2, 3])
    expect(screen.getByRole('button', { name: `Client ${id}` })).toBeTruthy();
  expect(screen.getByText('Assigned 2')).toBeTruthy();
  expect(screen.getByText('Current 2')).toBeTruthy();
  expect(screen.queryByText('Assigned 1')).toBeNull();
  expect(screen.queryByText('Current 3')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Client 3' }));
  expect(value.select).toHaveBeenCalledWith('client-3');
});

it('distinguishes zero values from unknown data and exposes no write or finish controls', async () => {
  jest.mocked(useOptionalWorkoutPreload).mockReturnValue(actions());
  await render(<WorkoutPreloadScreen />);
  expect(screen.getByText('0 кг · 0 повт.')).toBeTruthy();
  expect(screen.getByText('— · —')).toBeTruthy();
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  expect(
    screen.queryByRole('button', { name: /Сохранить|Завершить/ }),
  ).toBeNull();
  expect(
    screen.getByText(
      'Журнал доступен для просмотра. Ввод подходов и завершение тренировки пока недоступны.',
    ),
  ).toBeTruthy();
});

it.each(['hydrating', 'loading'] as const)(
  'shows %s without a misleading loaded program',
  async (status) => {
    const value = actions();
    jest
      .mocked(useOptionalWorkoutPreload)
      .mockReturnValue({ ...value, state: { ...value.state, status } });
    await render(<WorkoutPreloadScreen />);
    expect(screen.getByText('Загружаем тренировку…')).toBeTruthy();
    expect(screen.queryByText('Program 2')).toBeNull();
    expect(screen.queryByText('Ранее загруженная тренировка')).toBeNull();
  },
);

it.each(['storage', 'unavailable'] as const)(
  'shows %s error with a retry action and no false success',
  async (error) => {
    const value = actions();
    jest.mocked(useOptionalWorkoutPreload).mockReturnValue({
      ...value,
      state: { ...value.state, status: 'error', error },
    });
    await render(<WorkoutPreloadScreen />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Program 2')).toBeNull();
    expect(screen.queryByText('Программа загружена на телефон')).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Попробовать снова' }),
    );
    if (error === 'storage') expect(value.retry).toHaveBeenCalledTimes(1);
    else expect(mockReplace).toHaveBeenCalledWith('/workspace/today');
  },
);

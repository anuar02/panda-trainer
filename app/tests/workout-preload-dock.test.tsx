import { Dimensions } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WorkoutPreloadContext } from '@/domain/workout-preload/types';
import { WorkoutPreloadDock } from '@/features/workout-preload/dock';
import { useOptionalWorkoutPreload } from '@/features/workout-preload/provider';
import '../src/lib/i18n';
import '../src/features/workout-preload/strings';

jest.mock('expo-router', () => ({ usePathname: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(),
}));
jest.mock('../src/features/workout-preload/provider', () => ({
  useOptionalWorkoutPreload: jest.fn(),
}));
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
    exercises: [],
    assignedExercises: [],
  })),
};
function actions() {
  return {
    syncState: null,
    session: null,
    getSession: () => null,
    state: {
      status: 'ready' as const,
      context,
      recovery: {
        version: 1 as const,
        sessionKey: 'booking',
        bookingId: 'booking-3',
        clientRecordId: 'client-3',
        collapsed: true,
      },
      error: null,
      cached: true,
    },
    open: jest.fn(async () => {}),
    select: jest.fn(async () => {}),
    collapse: jest.fn(async () => {}),
    resume: jest.fn(async () => {}),
    retry: jest.fn(),
  };
}
beforeEach(() => {
  jest.mocked(usePathname).mockReturnValue('/workspace/today');
  jest
    .mocked(useSafeAreaInsets)
    .mockReturnValue({ top: 0, right: 0, bottom: 34, left: 0 });
  jest.mocked(useOptionalWorkoutPreload).mockReturnValue(actions());
});

it.each(['today', 'clients', 'schedule', 'finance', 'settings'])(
  'keeps the selected persisted participant available on workspace/%s',
  async (route) => {
    jest.mocked(usePathname).mockReturnValue(`/workspace/${route}`);
    const value = actions();
    jest.mocked(useOptionalWorkoutPreload).mockReturnValue(value);
    await render(<WorkoutPreloadDock />);
    expect(screen.getByText('Client 3')).toBeTruthy();
    expect(screen.getByText('Program 3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('workout-preload-dock'));
    expect(value.resume).toHaveBeenCalledTimes(1);
    expect(value.open).not.toHaveBeenCalled();
  },
);

it.each(['/workspace/journal', '/today', '/session/booking', '/sign-in'])(
  'hides the production dock on %s',
  async (route) => {
    jest.mocked(usePathname).mockReturnValue(route);
    await render(<WorkoutPreloadDock />);
    expect(screen.queryByTestId('workout-preload-dock')).toBeNull();
  },
);

it('renders no demo fallback without a production provider or cached context', async () => {
  jest.mocked(useOptionalWorkoutPreload).mockReturnValue(null);
  const first = await render(<WorkoutPreloadDock />);
  expect(screen.queryByTestId('workout-preload-dock')).toBeNull();
  await first.unmount();
  const value = actions();
  jest.mocked(useOptionalWorkoutPreload).mockReturnValue({
    ...value,
    state: { ...value.state, context: null, recovery: null },
  });
  await render(<WorkoutPreloadDock />);
  expect(screen.queryByTestId('workout-preload-dock')).toBeNull();
});

it('keeps complete client/program labels at 200% text scale and respects bottom safe area', async () => {
  const window = Dimensions.get('window');
  const nativeScreen = Dimensions.get('screen');
  await render(<WorkoutPreloadDock />);
  await act(async () =>
    Dimensions.set({
      window: { ...window, fontScale: 2 },
      screen: { ...nativeScreen, fontScale: 2 },
    }),
  );
  try {
    expect(screen.getByText('Client 3').props.numberOfLines).toBeUndefined();
    expect(screen.getByText('Program 3').props.numberOfLines).toBeUndefined();
    expect(
      screen.getByTestId('workout-preload-dock').parent?.props.style,
    ).toEqual({ paddingBottom: 34 });
  } finally {
    await act(async () => Dimensions.set({ window, screen: nativeScreen }));
  }
});

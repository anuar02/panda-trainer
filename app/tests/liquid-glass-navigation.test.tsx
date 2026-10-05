import type { PropsWithChildren } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { RoleTabs } from '../src/features/navigation/role-tabs';
import { ru as mockRu } from '../src/lib/i18n/ru';
import mockTokens from '../src/ui/tokens.json';
import {
  createWorkoutState,
  workoutReducer,
  type WorkoutState,
} from '../src/domain/workout';

let mockWorkout: { hydrated: boolean; state: WorkoutState } | null = null;

let mockScheme: 'dark' | 'light' = 'dark';
let mockScheduling: {
  hydrated: boolean;
  readError: boolean;
  state: {
    requests: Record<string, { state: string; awaiting: string | null }>;
  };
} | null = null;

jest.mock('expo-router/unstable-native-tabs', () => {
  const { Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Trigger = Object.assign(
    (props: PropsWithChildren<{ name: string }>) => (
      <View {...props} testID={`trigger-${props.name}`} />
    ),
    {
      Label: (props: PropsWithChildren) => <Text {...props} />,
      Icon: (props: object) => <View {...props} testID="native-icon" />,
      Badge: (props: PropsWithChildren) => (
        <Text {...props} testID="native-badge" />
      ),
    },
  );
  return {
    NativeTabs: Object.assign(
      (props: PropsWithChildren) => <View {...props} testID="native-tabs" />,
      {
        Trigger,
        BottomAccessory: (props: PropsWithChildren) => (
          <View {...props} testID="bottom-accessory" />
        ),
      },
    ),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: (props: PropsWithChildren) => (
      <View {...props} testID="dock-safe-area" />
    ),
  };
});
jest.mock('@/ui/theme', () => ({
  useTheme: () => ({
    scheme: mockScheme,
    colors: mockTokens.colors[mockScheme],
  }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      mockRu.tabs[key.slice(5) as keyof typeof mockRu.tabs] ?? key,
  }),
}));
jest.mock('@/features/scheduling-demo/provider', () => ({
  useOptionalSchedulingDemo: () => mockScheduling,
}));
jest.mock('@/features/workout-demo', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WorkoutDock: () => <View testID="resume-dock" />,
    useOptionalWorkoutDemo: () => mockWorkout,
  };
});

beforeEach(() => {
  mockScheme = 'dark';
  mockScheduling = null;
  mockWorkout = {
    hydrated: true,
    state: workoutReducer(createWorkoutState(), {
      type: 'open',
      sessionId: 's1',
    }),
  };
});
afterEach(() => jest.restoreAllMocks());

test.each(['trainer', 'client'] as const)(
  '%s uses automatic native insets, scroll minimization and the current app theme',
  async (role) => {
    const view = await render(<RoleTabs role={role} />);
    let props = view.getByTestId('native-tabs').props;
    expect(props.minimizeBehavior).toBe('onScrollDown');
    expect(props.disableTransparentOnScrollEdge).toBe(true);
    expect(props.labelVisibilityMode).toBe('labeled');
    expect(props.tintColor).toBe(mockTokens.colors.dark.accent);
    expect(props.unstable_nativeProps).toEqual(
      expect.objectContaining({ colorScheme: 'dark' }),
    );
    for (const trigger of view.getAllByTestId(/^trigger-/)) {
      expect(trigger.props.disableAutomaticContentInsets).not.toBe(true);
      expect(trigger.props.disableScrollToTop).not.toBe(true);
    }
    mockScheme = 'light';
    await view.rerender(<RoleTabs role={role} />);
    props = view.getByTestId('native-tabs').props;
    expect(props.tintColor).toBe(mockTokens.colors.light.accent);
    expect(props.unstable_nativeProps).toEqual(
      expect.objectContaining({ colorScheme: 'light' }),
    );
  },
);

test.each(['26.0', '26.0.1', '26.6.1'])(
  'iOS %s trainer dock belongs to the native bottom accessory',
  async (version) => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version);
    const view = await render(<RoleTabs role="trainer" />);
    expect(view.getByTestId('bottom-accessory')).toContainElement(
      view.getByTestId('resume-dock'),
    );
  },
);

test.each([
  ['ios', '18.0'],
  ['android', 35],
  ['web', 0],
] as const)(
  '%s %s trainer dock consumes normal layout space outside native tabs',
  async (os, version) => {
    jest.replaceProperty(Platform, 'OS', os);
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version);
    const view = await render(<RoleTabs role="trainer" />);
    expect(view.queryByTestId('bottom-accessory')).toBeNull();
    const tabs = view.getByTestId('native-tabs');
    const dock = view.getByTestId('resume-dock');
    expect(tabs).not.toContainElement(dock);
    let ancestor = dock.parent;
    while (ancestor) {
      expect(ancestor).not.toHaveStyle({ position: 'absolute' });
      ancestor = ancestor.parent;
    }
  },
);

test.each(['ios', 'android', 'web'] as const)(
  '%s client navigation does not include a workout dock',
  async (os) => {
    jest.replaceProperty(Platform, 'OS', os);
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue('26.0');
    const view = await render(<RoleTabs role="client" />);
    expect(view.queryByTestId('resume-dock')).toBeNull();
    expect(view.queryByTestId('bottom-accessory')).toBeNull();
  },
);

test('portable dock applies bottom safe area only while the journal is visible', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const view = await render(<RoleTabs role="trainer" />);
  const safeArea = () => view.getByTestId('dock-safe-area');
  expect(safeArea().props.edges).toEqual(['left', 'right']);
  await fireEvent(view.getByTestId('resume-dock'), 'layout', {
    nativeEvent: { layout: { height: 78, width: 390, x: 0, y: 0 } },
  });
  expect(safeArea().props.edges).toEqual(['bottom', 'left', 'right']);
  await fireEvent(view.getByTestId('resume-dock'), 'layout', {
    nativeEvent: { layout: { height: 0, width: 390, x: 0, y: 0 } },
  });
  expect(safeArea().props.edges).toEqual(['left', 'right']);
});

test('iOS 26 does not mount an empty native accessory without an unfinished journal', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue('26.0.1');
  mockWorkout = { hydrated: true, state: createWorkoutState() };
  const view = await render(<RoleTabs role="trainer" />);
  expect(view.queryByTestId('bottom-accessory')).toBeNull();
  const state = workoutReducer(createWorkoutState(), {
    type: 'open',
    sessionId: 's1',
  });
  mockWorkout = { hydrated: false, state };
  await view.rerender(<RoleTabs role="trainer" />);
  expect(view.queryByTestId('bottom-accessory')).toBeNull();
  mockWorkout = { hydrated: true, state };
  await view.rerender(<RoleTabs role="trainer" />);
  expect(view.getByTestId('bottom-accessory')).toBeTruthy();
  const journal = state.sessions.s1;
  if (!journal) throw new Error('Missing journal fixture');
  mockWorkout = {
    hydrated: true,
    state: { ...state, sessions: { s1: { ...journal, finished: true } } },
  };
  await view.rerender(<RoleTabs role="trainer" />);
  expect(view.queryByTestId('bottom-accessory')).toBeNull();
});

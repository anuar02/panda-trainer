import type { PropsWithChildren } from 'react';
import { render } from '@testing-library/react-native';
import {
  RoleTabs,
  routes,
  getTabBadgeValue,
} from '../src/features/navigation/role-tabs';
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
  '%s exposes exactly the established five destinations with native icons and translated labels',
  async (role) => {
    const expectedNames =
      role === 'trainer'
        ? ['today', 'schedule', 'clients', 'library', 'trainer-profile']
        : ['home', 'program', 'history', 'progress', 'client-profile'];
    const view = await render(<RoleTabs role={role} />);
    expect(routes[role].map((route) => route.name)).toEqual(expectedNames);
    expect(view.getAllByTestId(/^trigger-/)).toHaveLength(5);
    expect(view.getAllByTestId('native-icon')).toHaveLength(5);
    expect(view.queryByTestId('native-badge')).toBeNull();
    for (const route of routes[role]) {
      expect(
        view.getByTestId(`trigger-${route.name}`).props.accessibilityLabel,
      ).toBe(mockRu.tabs[route.label].replace('\u00ad', ''));
      expect(
        view.getByText(mockRu.tabs[route.label].replace('\u00ad', '')),
      ).toBeTruthy();
      expect(route.sf).toBeTruthy();
      expect(route.md).toBeTruthy();
    }
  },
);

test.each([null, undefined, 0, -1, 1.5, NaN, Infinity, -Infinity])(
  'count %s does not produce a badge',
  (count) => {
    expect(getTabBadgeValue(count)).toBeUndefined();
  },
);

test.each([1, 2, 100])(
  'positive integer %s produces a string badge',
  (count) => {
    expect(getTabBadgeValue(count)).toBe(String(count));
  },
);

test('trainer badge follows pending trainer requests and removes zero after a state change', async () => {
  mockScheduling = {
    hydrated: true,
    readError: false,
    state: {
      requests: {
        first: { state: 'pending', awaiting: 'trainer' },
        second: { state: 'counter', awaiting: 'trainer' },
        client: { state: 'pending', awaiting: 'client' },
        accepted: { state: 'accepted', awaiting: null },
      },
    },
  };
  const view = await render(<RoleTabs role="trainer" />);
  expect(view.getAllByTestId('native-badge')).toHaveLength(1);
  expect(view.getByTestId('native-badge')).toHaveTextContent('2');
  mockScheduling = { ...mockScheduling, state: { requests: {} } };
  await view.rerender(<RoleTabs role="trainer" />);
  expect(view.queryByTestId('native-badge')).toBeNull();
});

test.each([
  { hydrated: false, readError: false },
  { hydrated: true, readError: true },
])('untrusted scheduling data does not show a badge: %s', async (status) => {
  mockScheduling = {
    ...status,
    state: { requests: { request: { state: 'pending', awaiting: 'trainer' } } },
  };
  const view = await render(<RoleTabs role="trainer" />);
  expect(view.queryByTestId('native-badge')).toBeNull();
});

test('client navigation never shows the trainer badge', async () => {
  mockScheduling = {
    hydrated: true,
    readError: false,
    state: { requests: { request: { state: 'pending', awaiting: 'trainer' } } },
  };
  const view = await render(<RoleTabs role="client" />);
  expect(view.queryByTestId('native-badge')).toBeNull();
});

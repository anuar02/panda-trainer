import type { PropsWithChildren, ReactElement } from 'react';
import { Platform } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { NativeTabsInsetsProvider } from '../src/features/navigation/tab-bar-layout';
import {
  TrainerTodayScreen,
  type TrainerTodayData,
} from '../src/features/trainer-today/trainer-today-screen';
import { TrainerScheduleScreen } from '../src/features/trainer-schedule/trainer-schedule-screen';
import { TrainerClientsScreen } from '../src/features/trainer-clients/trainer-clients-screen';
import { TrainerLibraryScreen } from '../src/features/trainer-library/trainer-library-screen';
import {
  TrainerProfileScreen,
  ClientProfileScreen,
} from '../src/features/profiles/profile-screens';
import { ClientHomeScreen } from '../src/features/client-home/client-home-screen';
import { ClientProgramScreen } from '../src/features/client-program/client-program-screen';
import { ClientHistoryScreen } from '../src/features/client-history/client-history-screen';
import { ClientProgressScreen } from '../src/features/client-progress/client-progress-screen';
import { Screen } from '../src/ui/screen';
import type { DemoScenario } from '../src/features/demo/use-demo-scenario';

jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));

jest.mock('react-native-screens/experimental', () => ({
  ScrollViewMarker: ({ children }: PropsWithChildren) => {
    const Host =
      jest.requireActual<typeof import('react-native')>('react-native').View;
    return <Host testID="native-scroll-marker">{children}</Host>;
  },
}));

const presentations: [string, (scenario: DemoScenario) => ReactElement][] = [
  ['today', (scenario) => <TrainerTodayScreen scenario={scenario} />],
  ['schedule', (scenario) => <TrainerScheduleScreen scenario={scenario} />],
  ['clients', (scenario) => <TrainerClientsScreen scenario={scenario} />],
  [
    'library',
    (scenario) => (
      <TrainerLibraryScreen scenario={scenario} onOpenTemplate={() => {}} />
    ),
  ],
  [
    'trainer profile',
    (scenario) => <TrainerProfileScreen scenario={scenario} />,
  ],
  ['home', (scenario) => <ClientHomeScreen scenario={scenario} />],
  ['program', (scenario) => <ClientProgramScreen scenario={scenario} />],
  ['history', (scenario) => <ClientHistoryScreen scenario={scenario} />],
  ['progress', (scenario) => <ClientProgressScreen scenario={scenario} />],
  ['client profile', (scenario) => <ClientProfileScreen scenario={scenario} />],
];

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
});

afterEach(() => jest.restoreAllMocks());

test.each(presentations)(
  '%s keeps only its primary vertical list marked through scenarios',
  async (name, presentation) => {
    const tree = (scenario: DemoScenario) => (
      <NativeTabsInsetsProvider>
        {presentation(scenario)}
      </NativeTabsInsetsProvider>
    );
    const result = await render(tree('loading'));
    for (const scenario of [
      'loading',
      'normal',
      'empty',
      'offline',
      'loading',
    ] as const) {
      await result.rerender(tree(scenario));
      const markers = screen.queryAllByTestId('native-scroll-marker');
      expect(markers).toHaveLength(
        name === 'today' && scenario === 'loading' ? 0 : 1,
      );
      for (const marker of markers) {
        expect(marker.children).toHaveLength(1);
        const scroll = marker.children[0];
        expect(typeof scroll).not.toBe('string');
        if (typeof scroll === 'string' || !scroll)
          throw new Error('Missing primary scroll');
        expect(scroll.type).toMatch(/ScrollView/);
        expect(scroll.props.horizontal).not.toBe(true);
        expect(scroll.props.contentInsetAdjustmentBehavior).toBe('automatic');
      }
    }
  },
);

test('server Today outside native tabs leaves its scroll unmarked', async () => {
  const data: TrainerTodayData = {
    trainerName: 'Server trainer',
    timezone: 'UTC',
    dateLabel: '5 октября',
    clockLabel: '11:30',
    agenda: {
      date: '2026-10-05',
      clock: '11:30',
      rows: [],
      focusRow: null,
      requests: [],
      pastRows: [],
      items: [],
      pendingRequestCount: 0,
      summary: { total: 0, past: 0, current: 0, future: 0, progressPercent: 0 },
      endTime: null,
    },
    onSelectSession: () => {},
    onCreate: () => {},
    onOpenRequests: () => {},
    onOpenOverlap: () => {},
  };
  const result = await render(<TrainerTodayScreen data={data} />);
  expect(screen.queryByTestId('native-scroll-marker')).toBeNull();
  expect(
    screen
      .getByTestId('trainer-today-normal')
      .queryAll((node) => /ScrollView/.test(node.type)),
  ).toHaveLength(1);
  await result.rerender(
    <NativeTabsInsetsProvider>
      <TrainerTodayScreen data={data} />
    </NativeTabsInsetsProvider>,
  );
  expect(screen.getAllByTestId('native-scroll-marker')).toHaveLength(1);
  await result.unmount();
  expect(screen.queryByTestId('native-scroll-marker')).toBeNull();
});

test('library horizontal filters remain outside the primary marker target', async () => {
  await render(
    <NativeTabsInsetsProvider>
      <TrainerLibraryScreen onOpenTemplate={() => {}} />
    </NativeTabsInsetsProvider>,
  );
  const marker = screen.getByTestId('native-scroll-marker');
  const filters = marker.queryAll(
    (node) => /ScrollView/.test(node.type) && node.props.horizontal === true,
  );
  expect(filters).toHaveLength(1);
  expect(filters[0]!.parent?.props.testID).not.toBe('native-scroll-marker');
  expect(filters[0]!.props.contentInsetAdjustmentBehavior).not.toBe(
    'automatic',
  );
});

test('generic error screen marks primary scroll only in native tabs', async () => {
  const result = await render(<Screen title="Error" />);
  expect(screen.queryByTestId('native-scroll-marker')).toBeNull();
  await result.rerender(
    <NativeTabsInsetsProvider>
      <Screen title="Error" />
    </NativeTabsInsetsProvider>,
  );
  expect(screen.getAllByTestId('native-scroll-marker')).toHaveLength(1);
});

jest.mock('../src/features/workspace-scheduling/today-journal-hook', () => ({
  useTodayFinishedBookingIds: () => ({
    finishedIds: new Set<string>(),
    scoped: false,
    failed: false,
    loading: false,
    retry: jest.fn(),
  }),
}));

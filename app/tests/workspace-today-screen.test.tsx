import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { WorkspaceTodayScreen } from '../src/features/workspace-scheduling/workspace-today-screen';
import { useWorkspaceSchedule } from '../src/features/workspace-scheduling/use-schedule';
import type { TrainerTodayData } from '../src/features/trainer-today/trainer-today-screen';
import type { WorkspaceSchedule } from '../src/features/workspace-scheduling/service';
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({
    open,
    children,
  }: {
    open: boolean;
    children: import('react').ReactNode;
  }) => (open ? children : null),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
const mockPush = jest.fn();
let mockNow = new Date('2026-10-02T07:00:00.000Z');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../src/features/workspace-scheduling/use-clock', () => ({
  useWorkspaceClock: () => mockNow,
}));
jest.mock('../src/features/workspace-scheduling/use-schedule', () => ({
  useWorkspaceSchedule: jest.fn(),
}));
jest.mock('../src/features/trainer-today/trainer-today-screen', () => ({
  TrainerTodayScreen: ({ data }: { data: TrainerTodayData }) => {
    const { View, Text, Pressable } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <View>
        <Text>{data.trainerName}</Text>
        <Text>{data.agenda.date}</Text>
        {data.agenda.rows.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={row.name}
            onPress={() => data.onSelectSession(row)}
          >
            <Text>{row.name}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create"
          disabled={data.createDisabled}
          onPress={() => data.onCreate(data.agenda.date, '14:00')}
        >
          <Text>Create</Text>
        </Pressable>
      </View>
    );
  },
}));
const read = jest.mocked(useWorkspaceSchedule);
const retry = jest.fn();
const data: WorkspaceSchedule = {
  availability: {
    id: 'workspace',
    timezone: 'Asia/Almaty',
    working_days: [0, 1, 2, 3, 4, 5, 6],
    day_start: '07:00:00',
    day_end: '21:00:00',
    usual_session_minutes: 60,
  },
  bookings: [
    {
      id: 'booking',
      workspace_id: 'workspace',
      client_record_id: 'client',
      group_session_id: null,
      starts_at: '2026-10-02T08:00:00.000Z',
      ends_at: '2026-10-02T09:00:00.000Z',
      status: 'proposed',
      revision: 1,
      client_name: 'Реальный клиент',
    },
  ],
  pendingProposals: [],
};
const mount = () =>
  render(
    <WorkspaceTodayScreen
      userId="user"
      workspaceId="workspace"
      timezone="Asia/Almaty"
      trainerName="Реальный тренер"
    />,
  );
beforeEach(() => {
  mockPush.mockReset();
  mockNow = new Date('2026-10-02T07:00:00.000Z');
  read.mockReturnValue({
    schedule: data,
    loading: false,
    failed: false,
    retry,
  });
});
test('uses real trainer/session and opens the corresponding real detail', async () => {
  await mount();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Реальный клиент' }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workspace/schedule',
    params: { date: '2026-10-02', session: 'booking' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/workspace/new',
    params: { date: '2026-10-02', start: '14:00' },
  });
});
test('rolls the read scope to the next workspace day', async () => {
  const view = await mount();
  mockNow = new Date('2026-10-02T19:01:00.000Z');
  await view.rerender(
    <WorkspaceTodayScreen
      userId="user"
      workspaceId="workspace"
      timezone="Asia/Almaty"
      trainerName="Реальный тренер"
    />,
  );
  expect(read).toHaveBeenLastCalledWith('user', 'workspace', '2026-10-03');
});
test('loading carries real identity and an empty agenda without demo data', async () => {
  read.mockReturnValue({ schedule: null, loading: true, failed: false, retry });
  await mount();
  expect(screen.getByText('Реальный тренер')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Реальный клиент' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
  expect(mockPush).not.toHaveBeenCalled();
});

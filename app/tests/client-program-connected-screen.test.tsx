import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { ClientConnectedProgramScreen } from '../src/features/client-program/client-connected-program-screen';
import {
  ClientProgramScreen,
  type ClientProgramData,
} from '../src/features/client-program/client-program-screen';
import { useClientProgram } from '../src/features/client-program/use-program';
import { useClientSchedule } from '../src/features/client-scheduling/use-schedule';
import type { ClientSchedule } from '../src/features/client-scheduling/service';
import type { ClientProgramData as PersonalRead } from '../src/features/client-program/service';
import { router } from 'expo-router';
jest.mock('expo-router', () => {
  const taskRouter = { push: jest.fn(), replace: jest.fn() };
  return { router: taskRouter, useRouter: () => taskRouter };
});
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/use-clock', () => ({
  useWorkspaceClock: () => new Date('2030-10-02T06:00:00Z'),
}));
jest.mock('../src/features/client-program/use-program', () => ({
  useClientProgram: jest.fn(),
}));
jest.mock('../src/features/client-scheduling/use-schedule', () => ({
  useClientSchedule: jest.fn(),
}));
jest.mock('../src/features/client-program/client-program-screen', () => ({
  ClientProgramScreen: jest.fn(({ data }: { data: ClientProgramData }) => {
    const { Text, View, Pressable } =
      jest.requireActual<typeof import('react-native')>('react-native');
    const { useState } = jest.requireActual<typeof import('react')>('react');
    const [open, setOpen] = useState(false);
    return (
      <View>
        <Text>{data.programName ?? 'empty controlled plan'}</Text>
        <Text>
          {data.loading ? 'loading controlled plan' : 'ready controlled plan'}
        </Text>
        <Pressable testID="open-detail" onPress={() => setOpen(true)}>
          <Text>select</Text>
        </Pressable>
        {open && <Text>selected detail</Text>}
      </View>
    );
  }),
}));
const context = {
  clientRecordId: 'card',
  workspaceId: 'workspace',
  clientName: 'Own client',
  trainerName: 'Own trainer',
  timezone: 'Asia/Almaty',
};
const exercise = {
  id: 'snapshot',
  booking_program_id: 'booking-plan',
  exercise_name_snapshot: 'Immutable booking exercise',
  measure_snapshot: 'reps' as const,
  bodyweight_snapshot: false,
  muscle_group_snapshot: 'legs',
  equipment_snapshot: 'dumbbell',
  instructions_snapshot: ['Only snapshot instruction'],
  position: 0,
  planned_sets: 3,
  planned_reps: '8–10',
  planned_seconds: null,
  planned_weight_g: 0,
  rest_seconds: 45,
  note: 'Own plan note',
};
const schedule: ClientSchedule = {
  context,
  bookings: [
    {
      id: 'later-booking',
      workspace_id: 'workspace',
      client_record_id: 'card',
      group_session_id: null,
      starts_at: '2030-10-03T07:00:00Z',
      ends_at: '2030-10-03T08:00:00Z',
      status: 'confirmed',
      revision: 3,
      program: {
        id: 'booking-plan',
        name: 'Immutable booking plan',
        description: 'Own snapshot',
        exercises: [exercise],
      },
    },
  ],
  pendingProposals: [],
};
const personal: PersonalRead = {
  context,
  program: {
    id: 'latest-copy',
    name: 'Latest immutable personal copy',
    description: 'Newest copy',
    revision: 3,
    createdAtUtc: '2030-10-01T05:00:00Z',
    exercises: [
      {
        id: 'personal-exercise',
        name: 'Personal snapshot',
        measure: 'seconds',
        bodyweight: true,
        muscleGroup: 'core',
        equipment: 'bodyweight',
        instructions: ['Personal instruction'],
        position: 0,
        plannedSets: 2,
        plannedReps: null,
        plannedSeconds: '30',
        plannedWeightG: null,
        restSeconds: 20,
        note: null,
        revision: 1,
      },
    ],
  },
};
const props = {
  userId: 'user',
  workspaceId: 'workspace',
  clientRecordId: 'card',
  trainerName: 'Fallback trainer',
};
const scheduleRead = jest.mocked(useClientSchedule),
  personalRead = jest.mocked(useClientProgram),
  ui = jest.mocked(ClientProgramScreen),
  scheduleRetry = jest.fn(),
  personalRetry = jest.fn();
const uiData = () => ui.mock.calls.at(-1)![0].data!;
const scheduleState = () => ({
  schedule,
  loading: false,
  failed: false,
  error: null,
  retry: scheduleRetry,
});
const personalState = () => ({
  data: personal,
  loading: false,
  error: null,
  retry: personalRetry,
});
beforeEach(() => {
  jest.clearAllMocks();
  scheduleRead.mockReturnValue(scheduleState());
  personalRead.mockReturnValue(personalState());
});
test('upcoming booking immutable snapshot takes priority over latest personal copy', async () => {
  await render(<ClientConnectedProgramScreen {...props} />);
  expect(uiData()).toEqual(
    expect.objectContaining({
      trainerName: 'Own trainer',
      programName: 'Immutable booking plan',
      exercises: [
        expect.objectContaining({
          id: 'snapshot',
          name: 'Immutable booking exercise',
          weightGrams: 0,
          plannedReps: '8–10',
          instructions: ['Only snapshot instruction'],
        }),
      ],
    }),
  );
  expect(uiData().sessionLabel).toContain('12:00');
  expect(scheduleRead.mock.calls[0]![0]).not.toHaveProperty('startsAtUtc');
  uiData().onOpenSchedule();
  expect(router.replace).toHaveBeenCalledWith({
    pathname: '/connection/[clientRecordId]',
    params: { clientRecordId: 'card' },
  });
});
test('nearest no-plan slot has onsite note while later booked snapshot remains selected', async () => {
  scheduleRead.mockReturnValue({
    ...scheduleState(),
    schedule: {
      ...schedule,
      bookings: [
        {
          ...schedule.bookings[0]!,
          id: 'nearest-no-plan',
          starts_at: '2030-10-02T07:00:00Z',
          ends_at: '2030-10-02T08:00:00Z',
          program: null,
        },
        ...schedule.bookings,
      ],
    },
  });
  await render(<ClientConnectedProgramScreen {...props} />);
  expect(uiData().programName).toBe('Immutable booking plan');
  expect(uiData().onSiteLabel).toContain('12:00');
  expect(uiData().onSiteLabel).toContain('тренер подберёт упражнения на месте');
});
test('no upcoming bookings selects latest personal copy and its own snapshot fields', async () => {
  scheduleRead.mockReturnValue({
    ...scheduleState(),
    schedule: { ...schedule, bookings: [] },
  });
  await render(<ClientConnectedProgramScreen {...props} />);
  expect(uiData().programName).toBe('Latest immutable personal copy');
  expect(uiData().sessionLabel).toBeUndefined();
  expect(uiData().exercises[0]).toEqual(
    expect.objectContaining({
      name: 'Personal snapshot',
      plannedSeconds: '30',
      instructions: ['Personal instruction'],
    }),
  );
});
test('unneeded latest personal read failure does not block a valid booking snapshot', async () => {
  personalRead.mockReturnValue({
    ...personalState(),
    data: null,
    error: 'request',
  });
  await render(<ClientConnectedProgramScreen {...props} />);
  expect(uiData().programName).toBe('Immutable booking plan');
  expect(uiData().loading).toBe(false);
});
test('required latest fallback read failure shows retry without demo plan', async () => {
  scheduleRead.mockReturnValue({
    ...scheduleState(),
    schedule: { ...schedule, bookings: [] },
  });
  personalRead.mockReturnValue({
    ...personalState(),
    data: null,
    error: 'request',
  });
  await render(<ClientConnectedProgramScreen {...props} />);
  expect(ui).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  );
  expect(personalRetry).toHaveBeenCalled();
});
test('failed selected scope hides plan snapshots', async () => {
  scheduleRead.mockReturnValue({
    ...scheduleState(),
    schedule: { ...schedule, context: { ...context, workspaceId: 'foreign' } },
  });
  await render(<ClientConnectedProgramScreen {...props} />);
  expect(ui).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  ).toBeTruthy();
});
test('loading returns explicit empty controlled props and never default demo', async () => {
  scheduleRead.mockReturnValue({
    ...scheduleState(),
    schedule: null,
    loading: true,
  });
  await render(<ClientConnectedProgramScreen {...props} />);
  expect(uiData()).toEqual(
    expect.objectContaining({
      loading: true,
      programName: null,
      exercises: [],
    }),
  );
});
test('account and card remount clears prior detail state', async () => {
  const view = await render(<ClientConnectedProgramScreen {...props} />);
  await fireEvent.press(screen.getByTestId('open-detail'));
  expect(screen.getByText('selected detail')).toBeTruthy();
  await view.rerender(
    <ClientConnectedProgramScreen
      {...props}
      userId="other"
      clientRecordId="other-card"
    />,
  );
  expect(screen.queryByText('selected detail')).toBeNull();
  expect(scheduleRead).toHaveBeenLastCalledWith(
    expect.objectContaining({ userId: 'other', clientRecordId: 'other-card' }),
  );
  expect(personalRead).toHaveBeenLastCalledWith(
    expect.objectContaining({ userId: 'other', clientRecordId: 'other-card' }),
  );
});

test('required fallback loading keeps an explicit skeleton even if a previous latest copy is cached', async () => {
  scheduleRead.mockReturnValue({
    ...scheduleState(),
    schedule: { ...schedule, bookings: [] },
  });
  personalRead.mockReturnValue({ ...personalState(), loading: true });
  await render(<ClientConnectedProgramScreen {...props} />);
  expect(uiData().loading).toBe(true);
});
test('an upcoming slot with no attached plan does not silently substitute the latest personal copy', async () => {
  scheduleRead.mockReturnValue({
    ...scheduleState(),
    schedule: {
      ...schedule,
      bookings: [{ ...schedule.bookings[0]!, program: null }],
    },
  });
  personalRead.mockReturnValue({ ...personalState(), loading: true });
  await render(<ClientConnectedProgramScreen {...props} />);
  expect(uiData().programName).toBeNull();
  expect(uiData().exercises).toEqual([]);
  expect(uiData().loading).toBe(false);
});

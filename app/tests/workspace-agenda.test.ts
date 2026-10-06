import {
  workspaceAgendaSessions,
  workspaceFreeWindows,
} from '../src/features/workspace-scheduling/agenda';
import type {
  WorkspaceSchedule,
  WorkspaceScheduleBooking,
} from '../src/features/workspace-scheduling/service';

const booking = (
  id: string,
  start: string,
  end: string,
  overrides: Partial<WorkspaceScheduleBooking> = {},
): WorkspaceScheduleBooking => ({
  id,
  workspace_id: 'workspace',
  client_record_id: id,
  group_session_id: null,
  client_name: id,
  starts_at: `2026-10-05T${start}:00.000Z`,
  ends_at: `2026-10-05T${end}:00.000Z`,
  status: 'proposed',
  revision: 1,
  ...overrides,
});
const schedule = (bookings: WorkspaceScheduleBooking[]): WorkspaceSchedule => ({
  availability: {
    id: 'workspace',
    timezone: 'Asia/Almaty',
    working_days: [0],
    day_start: '07:00:00',
    day_end: '21:00:00',
    usual_session_minutes: 60,
  },
  bookings,
  pendingProposals: [],
});

test('groups only matching intervals and preserves participant replies', () => {
  const data = schedule([
    booking('b', '05:00', '06:00', {
      group_session_id: 'group',
      status: 'confirmed',
    }),
    booking('a', '05:00', '06:00', { group_session_id: 'group' }),
    booking('c', '07:00', '08:00', { group_session_id: 'group' }),
  ]);
  const result = workspaceAgendaSessions(data);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({
    date: '2026-10-05',
    startMinute: 600,
    endMinute: 660,
    replies: { confirmed: 1, pending: 1, cancelled: 0 },
  });
  expect(result[0]?.bookings.map((value) => value.client_name)).toEqual([
    'b',
    'a',
  ]);
  expect(data.bookings).toHaveLength(3);
});

test('midnight end is 24:00 on the starting workspace day', () => {
  expect(
    workspaceAgendaSessions(schedule([booking('a', '18:00', '19:00')]))[0],
  ).toMatchObject({ date: '2026-10-05', startMinute: 1380, endMinute: 1440 });
});

test('counts cancellations by either role without occupying the day', () => {
  const data = schedule([
    booking('a', '05:00', '06:00', {
      group_session_id: 'group',
      status: 'cancelled_by_client',
    }),
    booking('b', '05:00', '06:00', {
      group_session_id: 'group',
      status: 'cancelled_by_trainer',
    }),
  ]);
  expect(workspaceAgendaSessions(data)[0]?.replies.cancelled).toBe(2);
  expect(workspaceFreeWindows(data, '2026-10-05')).toEqual([
    { startMinute: 420, endMinute: 1260 },
  ]);
});

test('free windows merge overlapping and adjacent active bookings', () => {
  const data = schedule([
    booking('a', '03:00', '05:00'),
    booking('b', '04:00', '06:00'),
    booking('c', '06:00', '07:00'),
    booking('d', '12:00', '13:00', { status: 'cancelled_by_trainer' }),
  ]);
  expect(workspaceFreeWindows(data, '2026-10-05')).toEqual([
    { startMinute: 420, endMinute: 480 },
    { startMinute: 720, endMinute: 1260 },
  ]);
});

test('clips occupied intervals to working hours', () => {
  expect(
    workspaceFreeWindows(
      schedule([
        booking('a', '01:00', '03:00'),
        booking('b', '15:00', '18:00'),
      ]),
      '2026-10-05',
    ),
  ).toEqual([{ startMinute: 480, endMinute: 1200 }]);
});

test('returns full empty working day and no windows on days off', () => {
  expect(workspaceFreeWindows(schedule([]), '2026-10-05')).toEqual([
    { startMinute: 420, endMinute: 1260 },
  ]);
  expect(workspaceFreeWindows(schedule([]), '2026-10-06')).toEqual([]);
  expect(() => workspaceFreeWindows(schedule([]), '2026-02-30')).toThrow(
    RangeError,
  );
});

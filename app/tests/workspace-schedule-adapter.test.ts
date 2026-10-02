import {
  workspaceScheduleRows,
  workspaceScheduleWindows,
} from '../src/features/workspace-scheduling/screen-adapter';
import type {
  WorkspaceSchedule,
  WorkspaceScheduleBooking,
  WorkspaceScheduleProposal,
} from '../src/features/workspace-scheduling/service';

const booking = (
  id: string,
  overrides: Partial<WorkspaceScheduleBooking> = {},
): WorkspaceScheduleBooking => ({
  id,
  client_record_id: `client-${id}`,
  client_name: `Name ${id}`,
  workspace_id: 'workspace',
  group_session_id: null,
  starts_at: '2026-10-05T05:00:00.000Z',
  ends_at: '2026-10-05T06:00:00.000Z',
  status: 'confirmed',
  revision: 1,
  ...overrides,
});
const schedule = (
  bookings: WorkspaceScheduleBooking[],
  pendingProposals: WorkspaceScheduleProposal[] = [],
): WorkspaceSchedule => ({
  availability: {
    id: 'workspace',
    timezone: 'Asia/Almaty',
    working_days: [0],
    day_start: '09:00:00',
    day_end: '12:00:00',
    usual_session_minutes: 60,
  },
  bookings,
  pendingProposals,
});
const proposal = (
  source: WorkspaceScheduleBooking,
): WorkspaceScheduleProposal => ({
  id: 'proposal',
  workspace_id: 'workspace',
  booking_id: source.id,
  proposed_starts_at: '2026-10-06T23:30:00.000Z',
  proposed_ends_at: '2026-10-07T00:30:00.000Z',
  base_revision: 1,
  status: 'pending',
  revision: 1,
  created_at: '2026-10-05T00:00:00.000Z',
  updated_at: '2026-10-05T00:00:00.000Z',
  authorRole: 'client',
  booking: source,
});

test('single booking preserves its real name without demo program data', () => {
  const rows = workspaceScheduleRows(schedule([booking('a')]), 'Group');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: 'a',
    date: '2026-10-05',
    start: '10:00',
    end: '11:00',
    person: 'newClient',
    title: 'Name a',
    participantIds: ['client-a'],
    participantNames: ['Name a'],
    replies: { confirmed: 1, pending: 0, cancelled: 0 },
  });
  expect(rows[0]?.program).toBeUndefined();
  expect(rows[0]?.programName).toBeUndefined();
  expect(rows[0]?.request).toBeUndefined();
});

test('group retains named participants and their replies including cancellation', () => {
  const rows = workspaceScheduleRows(
    schedule([
      booking('a', { group_session_id: 'group' }),
      booking('b', { group_session_id: 'group', status: 'proposed' }),
      booking('c', {
        group_session_id: 'group',
        status: 'cancelled_by_client',
      }),
    ]),
    'Mini group',
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    person: 'group',
    title: 'Mini group',
    participantNames: ['Name a', 'Name b', 'Name c'],
    pending: true,
    replies: { confirmed: 1, pending: 1, cancelled: 1 },
  });
});

test('fully cancelled sessions disappear while another group interval stays separate', () => {
  const rows = workspaceScheduleRows(
    schedule([
      booking('a', { status: 'cancelled_by_client' }),
      booking('b', { status: 'cancelled_by_trainer' }),
      booking('c', { group_session_id: 'group' }),
      booking('d', {
        group_session_id: 'group',
        starts_at: '2026-10-05T06:00:00.000Z',
        ends_at: '2026-10-05T07:00:00.000Z',
      }),
    ]),
    'Group',
  );
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.start)).toEqual(['10:00', '11:00']);
});

test('proposal uses workspace calendar day and clock and matches by booking', () => {
  const a = booking('a');
  const b = booking('b', { group_session_id: 'group' });
  const rows = workspaceScheduleRows(schedule([a, b], [proposal(b)]), 'Group');
  expect(rows[0]?.request).toBeUndefined();
  expect(rows[1]?.request).toEqual({ date: '2026-10-07', time: '04:30' });
});

test('UTC date rollover and midnight end retain the workspace day', () => {
  const rows = workspaceScheduleRows(
    schedule([
      booking('a', {
        starts_at: '2026-10-04T23:30:00.000Z',
        ends_at: '2026-10-05T00:30:00.000Z',
      }),
      booking('b', {
        starts_at: '2026-10-05T18:00:00.000Z',
        ends_at: '2026-10-05T19:00:00.000Z',
      }),
    ]),
    'Group',
  );
  expect(rows[0]).toMatchObject({
    date: '2026-10-05',
    start: '04:30',
    end: '05:30',
  });
  expect(rows[1]).toMatchObject({
    date: '2026-10-05',
    start: '23:00',
    end: '24:00',
  });
});

test('free windows format workspace hours and ignore cancelled bookings', () => {
  const data = schedule([
    booking('a'),
    booking('b', { status: 'cancelled_by_trainer' }),
  ]);
  expect(workspaceScheduleWindows(data, '2026-10-05')).toEqual([
    { date: '2026-10-05', start: '09:00', end: '10:00' },
    { date: '2026-10-05', start: '11:00', end: '12:00' },
  ]);
  expect(workspaceScheduleWindows(data, '2026-10-06')).toEqual([]);
});

test('trainer-authored proposal is not represented as a request for the trainer to reply', () => {
  const source = booking('a');
  const rows = workspaceScheduleRows(
    schedule([source], [{ ...proposal(source), authorRole: 'trainer' }]),
    'Group',
  );
  expect(rows[0]?.request).toBeUndefined();
});

test('shows only a shared immutable program name for grouped bookings', () => {
  expect(
    workspaceScheduleRows(
      schedule([booking('a', { program_name: 'Снимок' })]),
      'Group',
    )[0]?.programName,
  ).toBe('Снимок');
  const grouped = [
    booking('a', { group_session_id: 'group', program_name: 'Снимок' }),
    booking('b', { group_session_id: 'group', program_name: 'Другая' }),
  ];
  expect(
    workspaceScheduleRows(schedule(grouped), 'Group')[0]?.programName,
  ).toBeUndefined();
});

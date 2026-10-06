import { workspaceTodayAgenda } from '@/features/workspace-scheduling/today-adapter';
import type {
  WorkspaceSchedule,
  WorkspaceScheduleBooking,
  WorkspaceScheduleProposal,
} from '@/features/workspace-scheduling/service';
const availability = {
  id: 'workspace',
  timezone: 'Asia/Almaty',
  working_days: [0, 1, 2, 3, 4],
  day_start: '08:00',
  day_end: '22:00',
  usual_session_minutes: 60,
};
const booking = (
  id: string,
  start: string,
  end: string,
  status: WorkspaceScheduleBooking['status'] = 'confirmed',
  group: string | null = null,
): WorkspaceScheduleBooking => ({
  id,
  workspace_id: 'workspace',
  client_record_id: `client-${id}`,
  group_session_id: group,
  starts_at: start,
  ends_at: end,
  status,
  revision: 1,
  client_name: `Имя ${id}`,
  program_name: 'План А',
});
const schedule = (
  bookings: WorkspaceScheduleBooking[],
  pendingProposals: WorkspaceScheduleProposal[] = [],
  timezone = 'Asia/Almaty',
): WorkspaceSchedule => ({
  availability: { ...availability, timezone },
  bookings,
  pendingProposals,
});
const proposal = (
  row: WorkspaceScheduleBooking,
  role: 'trainer' | 'client' = 'client',
): WorkspaceScheduleProposal => ({
  id: `proposal-${row.id}`,
  workspace_id: 'workspace',
  booking_id: row.id,
  proposed_starts_at: '2026-10-06T10:00:00Z',
  proposed_ends_at: '2026-10-06T11:00:00Z',
  base_revision: 1,
  status: 'pending',
  revision: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  authorRole: role,
  booking: row,
});
const now = new Date('2026-10-05T10:30:00Z');
test('orders chronological current and future rows, counts elapsed sessions', () => {
  const data = workspaceTodayAgenda(
    schedule([
      booking('future', '2026-10-05T12:00:00Z', '2026-10-05T13:00:00Z'),
      booking('current', '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z'),
      booking('past', '2026-10-05T08:00:00Z', '2026-10-05T09:00:00Z'),
    ]),
    now,
    'Группа',
  );
  expect(data.rows.map((row) => row.id)).toEqual(['past', 'current', 'future']);
  expect(data.summary).toEqual({
    total: 3,
    past: 1,
    current: 1,
    future: 1,
    progressPercent: 33,
  });
  expect(data.rows.map((row) => row.role)).toEqual([null, 'now', null]);
  expect(data.pastRows.map((row) => row.id)).toEqual(['past']);
  expect(data.endTime).toBe('18:00');
});
test('expands first upcoming only when none current', () => {
  const data = workspaceTodayAgenda(
    schedule([
      booking('a', '2026-10-05T12:00:00Z', '2026-10-05T13:00:00Z'),
      booking('b', '2026-10-05T14:00:00Z', '2026-10-05T15:00:00Z'),
    ]),
    now,
    'Группа',
  );
  expect(data.rows.map((row) => row.role)).toEqual(['next', null]);
});
test('uses occupied union for nested overlap gaps even with intervening cancellation', () => {
  const data = workspaceTodayAgenda(
    schedule([
      booking('long', '2026-10-05T10:00:00Z', '2026-10-05T13:00:00Z'),
      booking(
        'cancel',
        '2026-10-05T10:15:00Z',
        '2026-10-05T10:45:00Z',
        'cancelled_by_client',
      ),
      booking('nested', '2026-10-05T10:30:00Z', '2026-10-05T11:00:00Z'),
      booking('later', '2026-10-05T12:00:00Z', '2026-10-05T14:00:00Z'),
      booking('last', '2026-10-05T15:00:00Z', '2026-10-05T16:00:00Z'),
    ]),
    now,
    'Группа',
  );
  expect(
    data.items
      .filter((item) => item.kind === 'gap')
      .map((item) => item.durationMinutes),
  ).toEqual([60]);
  expect(
    data.items
      .filter((item) => item.kind === 'overlap')
      .map((item) => item.durationMinutes),
  ).toEqual([]);
  expect(data.pastRows.map((row) => row.id)).toEqual(['cancel']);
});
test('counts requests beyond today, keeps expired client-request session visible', () => {
  const past = booking('past', '2026-10-05T08:00:00Z', '2026-10-05T09:00:00Z');
  const other = booking(
    'other',
    '2026-10-06T08:00:00Z',
    '2026-10-06T09:00:00Z',
  );
  const data = workspaceTodayAgenda(
    schedule(
      [past, other],
      [proposal(past), proposal(other), proposal(other, 'trainer')],
    ),
    now,
    'Группа',
  );
  expect(data.pendingRequestCount).toBe(2);
  expect(data.pastRows).toEqual([]);
  expect(data.rows[0]?.pendingProposalIds).toEqual(['proposal-past']);
});
test('group excludes cancelled participant names/program while retains reply count', () => {
  const first = booking(
    'a',
    '2026-10-05T10:00:00Z',
    '2026-10-05T11:00:00Z',
    'confirmed',
    'g',
  );
  const cancelled = {
    ...booking(
      'b',
      first.starts_at,
      first.ends_at,
      'cancelled_by_trainer',
      'g',
    ),
    program_name: 'Другой',
  };
  const proposed = booking(
    'c',
    first.starts_at,
    first.ends_at,
    'proposed',
    'g',
  );
  const data = workspaceTodayAgenda(
    schedule([first, cancelled, proposed]),
    now,
    'Мини-группа',
  );
  expect(data.rows).toHaveLength(1);
  expect(data.rows[0]).toMatchObject({
    name: 'Мини-группа',
    participantNames: ['Имя a', 'Имя c'],
    programName: 'План А',
    replies: { confirmed: 1, pending: 1, cancelled: 1 },
    role: 'now',
  });
});
test('uses UTC classification across repeated DST hour rather than lexical clock', () => {
  const data = workspaceTodayAgenda(
    schedule(
      [booking('a', '2026-11-01T05:30:00Z', '2026-11-01T06:15:00Z')],
      [],
      'America/New_York',
    ),
    new Date('2026-11-01T06:00:00Z'),
    'Группа',
  );
  expect(data.rows[0]).toMatchObject({
    start: '01:30',
    end: '01:15',
    durationMinutes: 45,
    role: 'now',
    past: false,
  });
  expect(data.summary.current).toBe(1);
});
test('filters workspace date and represents exact next midnight as 24:00', () => {
  const data = workspaceTodayAgenda(
    schedule([
      booking('midnight', '2026-10-05T18:00:00Z', '2026-10-05T19:00:00Z'),
      booking('tomorrow', '2026-10-05T19:00:00Z', '2026-10-05T20:00:00Z'),
    ]),
    new Date('2026-10-05T18:30:00Z'),
    'Группа',
  );
  expect(data.date).toBe('2026-10-05');
  expect(data.rows.map((row) => row.id)).toEqual(['midnight']);
  expect(data.endTime).toBe('24:00');
});
test('all cancelled day has zero summary and no fake end time', () => {
  const data = workspaceTodayAgenda(
    schedule([
      booking(
        'a',
        '2026-10-05T10:00:00Z',
        '2026-10-05T11:00:00Z',
        'cancelled_by_trainer',
      ),
    ]),
    now,
    'Группа',
  );
  expect(data.summary).toEqual({
    total: 0,
    past: 0,
    current: 0,
    future: 0,
    progressPercent: 0,
  });
  expect(data.endTime).toBeNull();
  expect(data.rows[0]?.cancelled).toBe(true);
});

test('emits shared intersection links matching prototype overlapInfo', () => {
  const data = workspaceTodayAgenda(
    schedule([
      booking('a', '2026-10-05T10:00:00Z', '2026-10-05T12:00:00Z'),
      booking('b', '2026-10-05T10:30:00Z', '2026-10-05T11:30:00Z'),
      booking('c', '2026-10-05T11:00:00Z', '2026-10-05T13:00:00Z'),
    ]),
    now,
    'Группа',
  );
  expect(data.items.filter((item) => item.kind === 'overlap')).toEqual([
    {
      kind: 'overlap',
      startsAtUtc: '2026-10-05T11:00:00.000Z',
      endsAtUtc: '2026-10-05T11:30:00.000Z',
      durationMinutes: 30,
    },
    {
      kind: 'overlap',
      startsAtUtc: '2026-10-05T11:00:00.000Z',
      endsAtUtc: '2026-10-05T11:30:00.000Z',
      durationMinutes: 30,
    },
  ]);
});

test('renders every session once across focus, timeline and past', () => {
  const data = workspaceTodayAgenda(
    schedule([
      booking('past', '2026-10-05T08:00:00Z', '2026-10-05T09:00:00Z'),
      booking('current', '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z'),
      booking('overlap', '2026-10-05T10:15:00Z', '2026-10-05T11:15:00Z'),
      booking('future', '2026-10-05T12:00:00Z', '2026-10-05T13:00:00Z'),
    ]),
    now,
    'Группа',
  );
  const ids = [
    data.focusRow?.id,
    ...data.items.flatMap((item) =>
      item.kind === 'session' ? [item.row.id] : [],
    ),
    ...data.pastRows.map((row) => row.id),
  ];
  expect(ids.sort()).toEqual(['current', 'future', 'overlap', 'past']);
  expect(data.rows.filter((row) => row.role !== null)).toHaveLength(1);
  expect(data.items.filter((item) => item.kind === 'overlap')).toHaveLength(1);
});

test('represents pending trainer replies once and includes requests outside today', () => {
  const a = booking('a', '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z');
  const b = booking('b', '2026-10-06T10:00:00Z', '2026-10-06T11:00:00Z');
  const data = workspaceTodayAgenda(
    schedule(
      [a, b],
      [
        proposal(a),
        proposal(b),
        proposal(b, 'trainer'),
        { ...proposal(a), id: 'settled', status: 'accepted' },
      ],
    ),
    now,
    'Группа',
  );
  expect(data.requests.map((request) => request.id)).toEqual([
    'proposal-a',
    'proposal-b',
  ]);
  expect(data.pendingRequestCount).toBe(data.requests.length);
  expect(data.requests[1]).toMatchObject({
    sessionId: 'b',
    fromDate: '2026-10-06',
    fromStart: '15:00',
    toDate: '2026-10-06',
    toStart: '15:00',
  });
  const empty = workspaceTodayAgenda(schedule([]), now, 'Группа');
  expect(empty.requests).toEqual([]);
  expect(empty.pendingRequestCount).toBe(0);
  expect(empty.focusRow).toBeNull();
});

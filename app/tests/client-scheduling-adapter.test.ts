import {
  clientScheduleHome,
  clientBookingPlanDetail,
} from '@/features/client-scheduling/adapter';
import type {
  ClientBookingPlan,
  ClientSchedule,
  ClientScheduleBooking,
  ClientScheduleProposal,
} from '@/features/client-scheduling/service';
const context = {
  clientRecordId: 'client',
  workspaceId: 'workspace',
  timezone: 'Asia/Almaty',
  trainerName: 'Тренер',
  clientName: 'Клиент',
};
const booking = (
  id: string,
  start: string,
  end: string,
  status: ClientScheduleBooking['status'] = 'confirmed',
): ClientScheduleBooking => ({
  id,
  workspace_id: 'workspace',
  client_record_id: 'client',
  group_session_id: null,
  starts_at: start,
  ends_at: end,
  status,
  revision: 1,
  program: null,
});
const now = new Date('2026-10-05T10:30:00Z');
const schedule = (
  bookings: ClientScheduleBooking[],
  pendingProposals: ClientScheduleProposal[] = [],
  timezone = 'Asia/Almaty',
): ClientSchedule => ({
  context: { ...context, timezone },
  bookings,
  pendingProposals,
});
const proposal = (
  row: ClientScheduleBooking,
  authorRole: 'trainer' | 'client' = 'trainer',
): ClientScheduleProposal => ({
  id: 'proposal',
  bookingId: row.id,
  proposedStartsAtUtc: '2026-11-01T10:00:00Z',
  proposedEndsAtUtc: '2026-11-01T11:00:00Z',
  baseRevision: 1,
  revision: 1,
  authorRole,
  booking: row,
});
test('chronological own upcoming list excludes cancelled and elapsed bookings', () => {
  const data = clientScheduleHome(
    schedule([
      booking(
        'future',
        '2026-10-06T10:00:00Z',
        '2026-10-06T11:00:00Z',
        'proposed',
      ),
      booking(
        'cancel',
        '2026-10-05T10:00:00Z',
        '2026-10-05T11:00:00Z',
        'cancelled_by_client',
      ),
      booking('current', '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z'),
      booking('past', '2026-10-05T09:30:00Z', '2026-10-05T10:30:00Z'),
    ]),
    now,
  );
  expect(data.bookings.map((row) => row.id)).toEqual(['current', 'future']);
  expect(data.next).toMatchObject({
    id: 'current',
    ongoing: true,
    today: true,
    start: '15:00',
    end: '16:00',
    durationMinutes: 60,
    programName: null,
  });
  expect(data.bookings[1]).toMatchObject({
    needsConfirmation: true,
    today: false,
  });
});
test('uses actual own status and program snapshot for group without peers', () => {
  const row = {
    ...booking(
      'group',
      '2026-10-05T10:00:00Z',
      '2026-10-05T11:00:00Z',
      'proposed',
    ),
    group_session_id: 'group',
    program: {
      id: 'p',
      name: 'Снимок до правки',
      description: '',
      exercises: [],
    },
  };
  const data = clientScheduleHome(schedule([row]), now);
  expect(data.next).toMatchObject({
    group: true,
    programName: 'Снимок до правки',
    needsConfirmation: true,
  });
  expect(data.next).not.toHaveProperty('participantNames');
  expect(data.next).not.toHaveProperty('replies');
});
test('keeps outside-window own proposals and joins responding author role', () => {
  const own = booking('own', '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z');
  const outside = booking(
    'outside',
    '2026-12-05T10:00:00Z',
    '2026-12-05T11:00:00Z',
  );
  const data = clientScheduleHome(
    schedule(
      [own],
      [
        proposal(own),
        { ...proposal(outside, 'client'), id: 'outside-proposal' },
      ],
    ),
    now,
  );
  expect(data.next?.proposal?.authorRole).toBe('trainer');
  expect(data.pendingProposals.map((row) => row.id)).toEqual([
    'proposal',
    'outside-proposal',
  ]);
});
test('pending proposal on cancelled booking cannot become an actionable request', () => {
  const row = booking(
    'cancel',
    '2026-10-05T10:00:00Z',
    '2026-10-05T11:00:00Z',
    'cancelled_by_trainer',
  );
  const data = clientScheduleHome(schedule([row], [proposal(row)]), now);
  expect(data.pendingProposals).toEqual([]);
  expect(data.next).toBeNull();
});
test('UTC classification remains ongoing across repeated DST clock hour', () => {
  const data = clientScheduleHome(
    schedule(
      [booking('dst', '2026-11-01T05:30:00Z', '2026-11-01T06:15:00Z')],
      [],
      'America/New_York',
    ),
    new Date('2026-11-01T06:00:00Z'),
  );
  expect(data.next).toMatchObject({
    start: '01:30',
    end: '01:15',
    durationMinutes: 45,
    ongoing: true,
    today: true,
  });
});
test('workspace midnight and future date are independent of device calendar', () => {
  const data = clientScheduleHome(
    schedule([booking('end', '2026-10-05T18:00:00Z', '2026-10-05T19:00:00Z')]),
    new Date('2026-10-05T18:30:00Z'),
  );
  expect(data.today).toBe('2026-10-05');
  expect(data.next?.end).toBe('24:00');
  expect(
    clientScheduleHome(schedule([]), new Date('2026-10-05T19:01:00Z')).today,
  ).toBe('2026-10-06');
});
test('readonly program details snapshot instructions and preserve source order', () => {
  const line = {
    id: 'line',
    booking_program_id: 'p',
    exercise_name_snapshot: 'Присед',
    measure_snapshot: 'reps',
    bodyweight_snapshot: false,
    muscle_group_snapshot: 'Ноги',
    equipment_snapshot: 'Штанга',
    instructions_snapshot: ['Ровно'],
    position: 1,
    planned_sets: 3,
    planned_reps: '10',
    planned_seconds: null,
    planned_weight_g: 10000,
    rest_seconds: 90,
    note: 'Темп',
  };
  const plan: ClientBookingPlan = {
    id: 'p',
    name: 'План',
    description: 'Описание',
    exercises: [
      line,
      { ...line, id: 'first', position: 0, instructions_snapshot: [] },
    ],
  };
  const result = clientBookingPlanDetail(plan);
  expect(result?.exercises.map((row) => row.id)).toEqual(['first', 'line']);
  result?.exercises[1]?.instructions_snapshot.push('Changed');
  expect(plan.exercises[0]?.instructions_snapshot).toEqual(['Ровно']);
  expect(plan.exercises[0]?.id).toBe('line');
  expect(clientBookingPlanDetail(null)).toBeNull();
});

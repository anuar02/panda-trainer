import { clientProgramSelection } from '@/features/client-program/adapter';
import type { ClientPersonalProgram } from '@/features/client-program/service';
import type {
  ClientSchedule,
  ClientScheduleBooking,
  ClientBookingPlan,
} from '@/features/client-scheduling/service';
const now = new Date('2026-10-02T10:00:00Z');
const plan: ClientBookingPlan = {
  id: 'plan',
  name: 'Снимок группы',
  description: 'Описание',
  exercises: [
    {
      id: 'line',
      booking_program_id: 'plan',
      exercise_name_snapshot: 'Снимок упражнения',
      measure_snapshot: 'reps',
      bodyweight_snapshot: false,
      muscle_group_snapshot: 'Ноги',
      equipment_snapshot: 'Гантели',
      instructions_snapshot: ['Контроль'],
      position: 0,
      planned_sets: 3,
      planned_reps: '8–10',
      planned_seconds: null,
      planned_weight_g: 0,
      rest_seconds: 60,
      note: null,
    },
  ],
};
const booking = (
  id: string,
  starts = '2026-10-03T10:00:00Z',
  program: ClientBookingPlan | null = plan,
): ClientScheduleBooking => ({
  id,
  workspace_id: 'workspace',
  client_record_id: 'own',
  group_session_id: null,
  starts_at: starts,
  ends_at: new Date(Date.parse(starts) + 3600000).toISOString(),
  status: 'confirmed',
  revision: 1,
  program,
});
const schedule = (
  bookings: ClientScheduleBooking[],
  timezone = 'Asia/Almaty',
): ClientSchedule => ({
  context: {
    clientRecordId: 'own',
    workspaceId: 'workspace',
    timezone,
    trainerName: 'Тренер',
    clientName: 'Клиент',
  },
  bookings,
  pendingProposals: [],
});
const personal: ClientPersonalProgram = {
  id: 'personal',
  name: 'Личная копия',
  description: 'Личная',
  revision: 2,
  createdAtUtc: '2026-09-01T00:00:00Z',
  exercises: [
    {
      id: 'p-line',
      name: 'Личное упражнение',
      measure: 'seconds',
      bodyweight: true,
      muscleGroup: 'Кор',
      equipment: 'вес тела',
      instructions: ['Дышать'],
      position: 0,
      plannedSets: 0,
      plannedReps: null,
      plannedSeconds: '30–45',
      plannedWeightG: null,
      restSeconds: 0,
      note: 'Указание',
      revision: 1,
    },
  ],
};
test('uses chronological first nonempty immutable own booking plan even for group', () => {
  const first = { ...booking('first'), group_session_id: 'group' };
  const later = booking('later', '2026-10-04T10:00:00Z', {
    ...plan,
    name: 'Позднее',
  });
  const value = clientProgramSelection(schedule([later, first]), now, personal);
  expect(value.source).toBe('booking');
  expect(value.program?.name).toBe(plan.name);
  expect(value.session).toMatchObject({
    id: 'first',
    group: true,
    date: '2026-10-03',
    start: '15:00',
  });
  expect(value.exercises[0]?.name).toBe('Снимок упражнения');
  expect(value.onSiteBooking).toBeNull();
});
test('earlier no-plan booking produces on-site metadata while selecting later plan', () => {
  const value = clientProgramSelection(
    schedule([
      booking('planned', '2026-10-04T10:00:00Z'),
      booking('onsite', '2026-10-03T10:00:00Z', null),
    ]),
    now,
    personal,
  );
  expect(value.session?.id).toBe('planned');
  expect(value.onSiteBooking?.id).toBe('onsite');
});
test('all upcoming without exercises stays empty despite personal copy', () => {
  const value = clientProgramSelection(
    schedule([booking('none', undefined, { ...plan, exercises: [] })]),
    now,
    personal,
  );
  expect(value).toEqual({
    source: 'none',
    hasUpcoming: true,
    programName: null,
    program: null,
    session: null,
    onSiteBooking: null,
    exercises: [],
  });
});
test('ongoing UTC booking wins while ended and cancelled bookings do not suppress fallback', () => {
  const ongoing = booking('ongoing', '2026-10-02T09:30:00Z');
  const value = clientProgramSelection(
    schedule([booking('future'), ongoing]),
    now,
    personal,
  );
  expect(value.session).toMatchObject({
    id: 'ongoing',
    ongoing: true,
    today: true,
  });
  const canceled = {
    ...booking('cancel'),
    status: 'cancelled_by_client' as const,
  };
  expect(
    clientProgramSelection(
      schedule([booking('past', '2026-10-02T09:00:00Z'), canceled]),
      now,
      personal,
    ).source,
  ).toBe('personal');
});
test('no upcoming selects latest personal copy with stable created/id descending ordering', () => {
  const older = { ...personal, id: 'z-old' };
  const latest = {
    ...personal,
    id: 'a-latest',
    createdAtUtc: '2026-10-01T00:00:00Z',
  };
  const tie = { ...latest, id: 'z-latest', name: 'Последняя' };
  expect(
    clientProgramSelection(schedule([]), now, [latest, older, tie]).program
      ?.name,
  ).toBe('Последняя');
  expect(clientProgramSelection(schedule([]), now, null).source).toBe('none');
});
test('preserves range/null/zero/instructions without introducing catalog media', () => {
  const value = clientProgramSelection(
    schedule([booking('own')]),
    now,
    personal,
  );
  expect(value.exercises[0]).toMatchObject({
    sets: 3,
    plannedReps: '8–10',
    plannedSeconds: null,
    weightGrams: 0,
    instructions: ['Контроль'],
    note: null,
  });
  const fallback = clientProgramSelection(schedule([]), now, personal);
  expect(fallback.exercises[0]).toMatchObject({
    sets: 0,
    plannedReps: null,
    plannedSeconds: '30–45',
    weightGrams: null,
    restSeconds: 0,
  });
  expect(Object.keys(value.exercises[0]!)).not.toContain('exerciseId');
  expect(Object.keys(value.exercises[0]!)).not.toContain('media');
});
test('returned instructions/exercises/program metadata do not mutate either source', () => {
  const value = clientProgramSelection(
    schedule([booking('own')]),
    now,
    personal,
  );
  (value.exercises[0]!.instructions as string[]).push('Изменено');
  value.program!.name = 'Другое';
  expect(plan.name).toBe('Снимок группы');
  expect(plan.exercises[0]!.instructions_snapshot).toEqual(['Контроль']);
  const fallback = clientProgramSelection(schedule([]), now, personal);
  (fallback.exercises[0]!.instructions as string[]).push('Другое');
  expect(personal.exercises[0]!.instructions).toEqual(['Дышать']);
});
test('local calendar and exact next midnight metadata follow timezone rather than UTC date', () => {
  const value = clientProgramSelection(
    schedule([booking('late', '2026-10-02T18:00:00Z')]),
    now,
    null,
  );
  expect(value.session).toMatchObject({
    date: '2026-10-02',
    start: '23:00',
    end: '24:00',
  });
  const next = clientProgramSelection(
    schedule([booking('next', '2026-10-02T21:00:00Z')]),
    now,
    null,
  );
  expect(next.session?.date).toBe('2026-10-03');
});
test('repeated DST hour selects by UTC instant despite identical wall clocks', () => {
  const before = booking('before', '2026-11-01T05:15:00Z');
  before.ends_at = '2026-11-01T05:45:00Z';
  const after = booking('after', '2026-11-01T06:15:00Z');
  const value = clientProgramSelection(
    schedule([after, before], 'America/New_York'),
    new Date('2026-11-01T05:30:00Z'),
    null,
  );
  expect(value.session).toMatchObject({
    id: 'before',
    start: '01:15',
    ongoing: true,
  });
});

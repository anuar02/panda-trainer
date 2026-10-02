import { clientHistoryProgress } from '@/features/client-progress/adapter';
import type {
  ClientHistory,
  ClientHistoryExercise,
  ClientHistoryJournal,
} from '@/features/client-history/service';
const now = new Date('2026-10-02T10:00:00Z');
const exercise = (
  name = 'Присед',
  weightG: number | null = 50000,
  reps: number | null = 8,
  options: Partial<ClientHistoryExercise> = {},
): ClientHistoryExercise => ({
  id: 'line',
  exerciseId: 'catalog',
  name,
  measure: 'reps',
  bodyweight: false,
  muscleGroup: 'Ноги',
  equipment: 'Гантели',
  instructions: [],
  position: 0,
  plannedSets: 3,
  plannedReps: '8',
  plannedSeconds: null,
  plannedWeightG: 50000,
  restSeconds: 60,
  replacedFromId: null,
  skipped: false,
  revision: 1,
  sets: [{ id: 'set', position: 0, reps, seconds: null, weightG, revision: 1 }],
  ...options,
});
const journal = (
  date: string,
  exercises: ClientHistoryExercise[],
): ClientHistoryJournal => ({
  id: date,
  bookingId: 'booking',
  startedAtUtc: `${date}T10:00:00Z`,
  finishedAtUtc: `${date}T11:00:00Z`,
  revision: 1,
  exercises,
  notes: [],
});
const history = (
  journals: ClientHistoryJournal[],
  timezone = 'Asia/Almaty',
  nextOffset: number | null = null,
): ClientHistory => ({
  context: {
    clientRecordId: 'own',
    workspaceId: 'workspace',
    timezone,
    clientName: 'Клиент',
    trainerName: 'Тренер',
  },
  journals,
  nextOffset,
});
test('best preserves same-set weight and reps instead of combining maxima', () => {
  const value = clientHistoryProgress(
    history([
      journal('2026-10-01', [
        exercise('Присед', 50000, 8),
        exercise('Присед', 40000, 20),
        exercise('Присед', 50000, 10),
      ]),
    ]),
    now,
  );
  expect(value.results[0]?.best).toEqual({
    kg: 50,
    reps: 10,
    date: '2026-10-01',
  });
  expect(value.results[0]?.delta).toBeNull();
});
test('four-week baseline is best known at or before cutoff, not closest or latest', () => {
  const rows = [
    journal('2026-10-02', [exercise('Присед', 50500, 8)]),
    journal('2026-09-04', [exercise('Присед', 40000, 10)]),
    journal('2026-08-20', [exercise('Присед', 45000, 6)]),
    journal('2026-09-05', [exercise('Присед', 50000, 8)]),
  ];
  const result = clientHistoryProgress(history(rows), now).results[0];
  expect(result?.baselineDate).toBe('2026-08-20');
  expect(result?.delta).toBe(5.5);
  expect(result?.deltaUnit).toBe('кг');
});
test('daily series includes cutoff56days, excludes older days, uses maximum recorded weight', () => {
  const rows = [
    journal('2026-08-06', [exercise('Присед', 10000, 8)]),
    journal('2026-08-07', [exercise('Присед', 20000, 8)]),
    journal('2026-10-01', [
      exercise('Присед', 30000, 8),
      exercise('Присед', 25000, 20),
    ]),
  ];
  expect(clientHistoryProgress(history(rows), now).results[0]?.series).toEqual([
    { date: '2026-08-07', value: 20 },
    { date: '2026-10-01', value: 30 },
  ]);
});
test('canonical normalized snapshot name+measure groups independent IDs without catalog aliases', () => {
  const a = exercise(' Ё-ЖИМ ', 20000, 8);
  const b = { ...exercise('е жим', 25000, 8), exerciseId: 'different-catalog' };
  const renamed = {
    ...exercise('Иное название', 50000, 8),
    exerciseId: a.exerciseId,
  };
  const results = clientHistoryProgress(
    history([journal('2026-10-01', [a, b, renamed])]),
    now,
  ).results;
  expect(results).toHaveLength(2);
  expect(results[0]?.best.kg).toBe(25);
  expect(results[1]?.name).toBe('Иное название');
});
test('known zero weight bodyweight uses repetitions while null weight and zero quantity stay unranked', () => {
  const rows = [
    exercise('Отжимания', 0, 10, { bodyweight: true }),
    exercise('Отжимания', 0, 20, { bodyweight: true }),
    exercise('Нулевой', 20000, 0),
    exercise('Неизвестный вес', null, 12, { bodyweight: true }),
    exercise('Неизвестные повторы', 50000, null),
  ];
  const value = clientHistoryProgress(
    history([journal('2026-10-01', rows)]),
    now,
  );
  expect(value.results).toHaveLength(1);
  expect(value.results[0]).toMatchObject({
    best: { kg: 0, reps: 20 },
    deltaUnit: 'повт',
    series: [{ date: '2026-10-01', value: 20 }],
  });
  expect(rows[3]?.sets[0]?.weightG).toBeNull();
});
test('timed results use seconds and are separate from repetitions of same name', () => {
  const timed = exercise('Планка', 0, null, {
    measure: 'seconds',
    plannedReps: null,
    plannedSeconds: '30',
    sets: [
      {
        id: 'timed',
        position: 0,
        reps: null,
        seconds: 60,
        weightG: 0,
        revision: 1,
      },
    ],
  });
  const results = clientHistoryProgress(
    history([journal('2026-10-01', [timed, exercise('Планка', 0, 12)])]),
    now,
  ).results;
  expect(results).toHaveLength(2);
  expect(results[0]).toMatchObject({
    unit: 'сек',
    best: { reps: 60, kg: 0 },
    deltaUnit: 'сек',
  });
});
test('skipped and replaced source retain already-recorded actual sets', () => {
  const rows = [
    exercise('Исходное', 30000, 8, { skipped: true }),
    exercise('Замена', 20000, 10, { replacedFromId: 'line' }),
  ];
  expect(
    clientHistoryProgress(
      history([journal('2026-10-01', rows)]),
      now,
    ).results.map((row) => row.name),
  ).toEqual(['Исходное', 'Замена']);
});
test('calendar day follows workspace timezone and excludes future local dates', () => {
  const row = {
    ...journal('2026-10-02', [exercise()]),
    startedAtUtc: '2026-10-02T23:30:00Z',
  };
  expect(
    clientHistoryProgress(history([row], 'Asia/Almaty'), now).results,
  ).toEqual([]);
  expect(
    clientHistoryProgress(history([row], 'America/New_York'), now).results[0]
      ?.best.date,
  ).toBe('2026-10-02');
});
test('DST repeated hour remains one calendar point without counting attendance', () => {
  const first = {
    ...journal('2026-11-01', [exercise('Присед', 30000, 8)]),
    startedAtUtc: '2026-11-01T05:30:00Z',
  };
  const second = {
    ...journal('2026-11-01', [exercise('Присед', 35000, 8)]),
    startedAtUtc: '2026-11-01T06:30:00Z',
  };
  const value = clientHistoryProgress(
    history([first, second], 'America/New_York'),
    new Date('2026-11-01T12:00:00Z'),
  );
  expect(value.results[0]?.series).toEqual([{ date: '2026-11-01', value: 35 }]);
  expect(Object.keys(value)).not.toContain('attendance');
});
test('partial pagination exposes completeness and never silently claims global history', () => {
  expect(clientHistoryProgress(history([], undefined, 50), now).complete).toBe(
    false,
  );
  expect(clientHistoryProgress(history([]), now).complete).toBe(true);
});
test('output mutation does not alter historic sets', () => {
  const source = history([journal('2026-10-01', [exercise()])]);
  const result = clientHistoryProgress(source, now);
  result.results[0]!.best.kg = 0;
  expect(source.journals[0]?.exercises[0]?.sets[0]?.weightG).toBe(50000);
});

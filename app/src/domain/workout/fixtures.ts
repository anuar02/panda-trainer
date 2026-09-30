import type { WorkoutExercise, WorkoutSession } from './types';

export const workoutClients: Record<
  string,
  { name: string; short: string; initials: string; program: string }
> = {
  c7: { name: 'Новый клиент', short: 'Без имени', initials: '?', program: '' },
  c6: { name: 'Тимур Ахметов', short: 'Тимур', initials: 'ТА', program: '' },
  c1: {
    name: 'Айгерим Бекова',
    short: 'Айгерим',
    initials: 'АБ',
    program: 'Низ А',
  },
  c2: {
    name: 'Арман Оспанов',
    short: 'Арман',
    initials: 'АО',
    program: 'Сила 5×5',
  },
  c3: {
    name: 'Алия Нурлановa',
    short: 'Алия',
    initials: 'АН',
    program: 'Низ А',
  },
  c4: {
    name: 'Мади Касымов',
    short: 'Мади',
    initials: 'МК',
    program: 'Верх Б',
  },
  c5: {
    name: 'Дана Ержанова',
    short: 'Дана',
    initials: 'ДЕ',
    program: 'Full Body',
  },
};

type ExerciseSeed = [string, number, string, number, number, number];
const seeds: Record<string, ExerciseSeed[]> = {
  'Низ А': [
    ['Приседания со штангой', 4, '8', 80, 8, 100],
    ['Румынская тяга', 3, '10', 60, 10, 75],
    ['Жим ногами', 3, '12', 120, 12, 150],
    ['Выпады с гантелями', 3, '12', 16, 12, 20],
    ['Планка', 3, '45 сек', 0, 45, 0],
  ],
  'Верх Б': [
    ['Жим лёжа', 4, '8', 40, 10, 72.5],
    ['Жим гантелей под углом', 3, '10', 22, 10, 26],
    ['Тяга блока к поясу', 3, '12', 45, 12, 55],
    ['Махи в стороны', 3, '15', 10, 15, 12],
  ],
  'Full Body': [
    ['Приседания со штангой', 3, '10', 50, 10, 70],
    ['Отжимания', 3, '12', 0, 12, 0],
    ['Тяга в наклоне', 3, '12', 30, 12, 40],
    ['Планка', 3, '40 сек', 0, 40, 0],
  ],
  'Сила 5×5': [
    ['Приседания со штангой', 5, '5', 100, 5, 120],
    ['Жим лёжа', 5, '5', 70, 5, 85],
    ['Становая тяга', 1, '5', 120, 5, 140],
  ],
};

export function workoutExercises(program: string | null): WorkoutExercise[] {
  return (program ? (seeds[program] ?? []) : []).map(
    ([name, sets, reps, target, previousReps, pr], i) => ({
      id: `e${i + 1}`,
      name,
      sets,
      plannedSets: sets,
      reps,
      target,
      prev: { kg: target, reps: previousReps },
      pr,
      unit: name === 'Планка' ? 'сек' : 'повт',
    }),
  );
}

const personal = (
  id: string,
  clientId: string,
  start: string,
  end: string,
  date = '2026-09-14',
): WorkoutSession => ({
  id,
  date,
  start,
  end,
  kind: 'personal',
  title:
    id === 's1'
      ? 'Утренняя сессия'
      : id === 's7'
        ? 'Растяжка'
        : 'Индивидуальная',
  program: id === 's7' ? null : (workoutClients[clientId]?.program ?? null),
  clientId,
  participants: [{ clientId, reply: 'confirmed' }],
});

export const workoutSessions: WorkoutSession[] = [
  personal('s1', 'c5', '09:00', '10:00'),
  personal('s2', 'c4', '11:30', '12:30'),
  personal('s3', 'c2', '14:00', '15:00'),
  personal('s4', 'c1', '18:00', '19:00'),
  personal('s5', 'c2', '18:30', '19:30'),
  {
    id: 's6',
    date: '2026-09-14',
    start: '20:00',
    end: '21:00',
    kind: 'group',
    title: 'Мини-группа',
    program: 'Разные программы',
    clientId: null,
    participants: [
      { clientId: 'c3', reply: 'confirmed' },
      { clientId: 'c4', reply: 'cancelled' },
      { clientId: 'c5', reply: 'pending' },
    ],
  },
  personal('s7', 'c1', '21:15', '22:00'),
  personal('s8', 'c1', '18:00', '19:00', '2026-09-17'),
  personal('s9', 'c2', '14:00', '15:00', '2026-09-15'),
];

export function getWorkoutSession(
  id: string,
  catalog: readonly WorkoutSession[] = workoutSessions,
) {
  return catalog.find((session) => session.id === id);
}

import { workoutSessions } from './fixtures';
import { workoutExerciseKey } from './library';
import type {
  WorkoutClientHistory,
  WorkoutClientProgress,
  WorkoutSet,
  WorkoutState,
} from './types';

export function workoutClientHistory(
  state: WorkoutState,
  clientId: string,
): WorkoutClientHistory[] {
  return (state.catalog ?? workoutSessions).flatMap((session) => {
    const log = state.sessions[session.id];
    const plan = log?.plans[clientId];
    if (
      !log?.finished ||
      !plan ||
      !session.participants.some(
        (p) => p.clientId === clientId && p.reply !== 'cancelled',
      )
    )
      return [];
    const list = plan.exercises;
    const counts: [string, number][] = [
      [
        'заменено',
        list.filter((e) => e.origin === 'replaced' && !e.replacedBy).length,
      ],
      ['добавлено', list.filter((e) => e.origin === 'added').length],
      ['пропущено', list.filter((e) => e.skipped && !e.replacedBy).length],
    ];
    return [
      {
        sessionId: session.id,
        date: session.date,
        notes: (log.notes?.[clientId] ?? [])
          .filter((n) => n.shared)
          .map((n) => ({ text: n.text, at: n.at })),
        changes: counts
          .filter(([, count]) => count)
          .map(([label, count]) => `${label} ${count}`)
          .join(' · '),
        exercises: list.map((e) => ({
          name: e.name,
          unit: e.unit,
          values: (log.values[clientId]?.[e.id] ?? [])
            .filter((v): v is WorkoutSet => v !== null)
            .map((v) => ({ ...v })),
        })),
      },
    ];
  });
}

export function workoutClientProgress(
  state: WorkoutState,
  clientId: string,
  today = '2026-09-14',
): WorkoutClientProgress[] {
  const dayBefore = (days: number) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  };
  const groups = new Map<
    string,
    {
      name: string;
      unit: 'сек' | 'повт';
      rows: (WorkoutSet & { date: string })[];
    }
  >();
  for (const log of workoutClientHistory(state, clientId)) {
    if (log.date > today) continue;
    for (const exercise of log.exercises) {
      for (const value of exercise.values) {
        const key = `${workoutExerciseKey(exercise.name)}:${exercise.unit}`;
        const group = groups.get(key) ?? {
          name: exercise.name,
          unit: exercise.unit,
          rows: [],
        };
        group.rows.push({ ...value, date: log.date });
        groups.set(key, group);
      }
    }
  }
  return [...groups.values()].flatMap((group) => {
    const ranked = [...group.rows].sort(
      (a, b) => b.kg - a.kg || b.reps - a.reps,
    );
    const best = ranked[0];
    if (!best) return [];
    const baseline = ranked.find((row) => row.date <= dayBefore(28));
    const daily = new Map<string, number>();
    for (const row of group.rows.filter((row) => row.date >= dayBefore(56)))
      daily.set(
        row.date,
        Math.max(daily.get(row.date) ?? 0, best.kg ? row.kg : row.reps),
      );
    return [
      {
        name: group.name,
        unit: group.unit,
        best: { ...best },
        delta: baseline
          ? Number(
              (
                (best.kg ? best.kg : best.reps) -
                (best.kg ? baseline.kg : baseline.reps)
              ).toFixed(3),
            )
          : null,
        deltaUnit: best.kg ? ('кг' as const) : group.unit,
        baselineDate: baseline?.date ?? null,
        series: [...daily]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, value]) => ({ date, value })),
      },
    ];
  });
}

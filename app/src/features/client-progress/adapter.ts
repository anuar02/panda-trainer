import type { WorkoutClientProgress } from '@/domain/workout/types';
import { workoutExerciseKey } from '@/domain/workout/library';
import { workspaceDateKey } from '../workspace-scheduling/clock';
import type { ClientHistory } from '../client-history/service';

export type ClientProgressResult = WorkoutClientProgress & { key: string };
export type ClientHistoryProgress = {
  results: ClientProgressResult[];
  complete: boolean;
};
export function clientHistoryProgress(
  history: ClientHistory,
  now: Date,
): ClientHistoryProgress {
  const today = workspaceDateKey(now, history.context.timezone);
  const before = (days: number) => {
    const value = new Date(`${today}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() - days);
    return value.toISOString().slice(0, 10);
  };
  const groups = new Map<
    string,
    {
      name: string;
      unit: 'сек' | 'повт';
      rows: { kg: number; reps: number; date: string }[];
    }
  >();
  for (const journal of history.journals) {
    const date = workspaceDateKey(
      new Date(journal.startedAtUtc),
      history.context.timezone,
    );
    if (date > today) continue;
    for (const exercise of journal.exercises) {
      const unit = exercise.measure === 'seconds' ? 'сек' : 'повт';
      for (const set of exercise.sets) {
        const quantity =
          exercise.measure === 'seconds' ? set.seconds : set.reps;
        if (quantity === null || quantity <= 0 || set.weightG === null)
          continue;
        const key = `${workoutExerciseKey(exercise.name)}:${unit}`;
        const group = groups.get(key) ?? {
          name: exercise.name,
          unit,
          rows: [],
        };
        group.rows.push({ kg: set.weightG / 1000, reps: quantity, date });
        groups.set(key, group);
      }
    }
  }
  const results: ClientProgressResult[] = [];
  for (const [key, group] of groups) {
    const ranked = [...group.rows].sort(
      (a, b) => b.kg - a.kg || b.reps - a.reps,
    );
    const best = ranked[0];
    if (!best) continue;
    const baseline = ranked.find((row) => row.date <= before(28));
    const daily = new Map<string, number>();
    for (const row of group.rows.filter((value) => value.date >= before(56)))
      daily.set(
        row.date,
        Math.max(daily.get(row.date) ?? 0, best.kg ? row.kg : row.reps),
      );
    results.push({
      key,
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
      deltaUnit: best.kg ? 'кг' : group.unit,
      baselineDate: baseline?.date ?? null,
      series: [...daily]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value })),
    });
  }
  return { results, complete: history.nextOffset === null };
}

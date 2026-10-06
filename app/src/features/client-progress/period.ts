import { workspaceDateKey } from '../workspace-scheduling/clock';

export function clientProgressWeek(now: Date, timezone: string, offset = 0) {
  const today = workspaceDateKey(now, timezone);
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(
    start.getUTCDate() - ((start.getUTCDay() + 6) % 7) + offset * 7,
  );
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { startsOn: days[0]!, endsOn: end.toISOString().slice(0, 10), days };
}

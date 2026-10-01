const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const minuteMilliseconds = 60_000;
const dayMilliseconds = 24 * 60 * minuteMilliseconds;

const dateParts = (value: Date, timeZone: string) => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new RangeError('Invalid date');
  return new Intl.DateTimeFormat('en-US-u-ca-iso8601', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
};

const partValue = (parts: Intl.DateTimeFormatPart[], type: string) => {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new RangeError('Invalid date or timezone');
  return Number(value);
};

const parseDateKey = (dateKey: string) => {
  const match = dateKeyPattern.exec(dateKey);
  if (!match) throw new RangeError('Invalid calendar date');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() + 1 !== month ||
    value.getUTCDate() !== day
  )
    throw new RangeError('Invalid calendar date');
  return value;
};

const calendarDateKey = (value: Date) => value.toISOString().slice(0, 10);

export function workspaceDateKey(value: Date, timeZone: string): string {
  const parts = dateParts(value, timeZone);
  const year = partValue(parts, 'year');
  const month = partValue(parts, 'month');
  const day = partValue(parts, 'day');
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function workspaceMinuteOfDay(value: Date, timeZone: string): number {
  const parts = dateParts(value, timeZone);
  return partValue(parts, 'hour') * 60 + partValue(parts, 'minute');
}

export function workspaceMondayWeekday(value: Date, timeZone: string): number {
  const dateKey = workspaceDateKey(value, timeZone);
  return (parseDateKey(dateKey).getUTCDay() + 6) % 7;
}

export function calendarWeekDateKeys(dateKey: string): string[] {
  const date = parseDateKey(dateKey);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date.getTime());
    day.setUTCDate(day.getUTCDate() - mondayOffset + index);
    return calendarDateKey(day);
  });
}

export function paddedUtcWeekBounds(dateKey: string): {
  startsAtUtc: string;
  endsAtUtc: string;
} {
  const week = calendarWeekDateKeys(dateKey);
  const first = week[0];
  if (!first) throw new RangeError('Invalid calendar week');
  const startsAt = parseDateKey(first).getTime() - dayMilliseconds;
  const endsAt = startsAt + 9 * dayMilliseconds;
  return {
    startsAtUtc: new Date(startsAt).toISOString(),
    endsAtUtc: new Date(endsAt).toISOString(),
  };
}

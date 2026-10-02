import { workspaceDateKey, workspaceMinuteOfDay } from './clock';
import type { WorkspaceSchedule, WorkspaceScheduleBooking } from './service';

export type WorkspaceAgendaSession = {
  id: string;
  groupSessionId: string | null;
  date: string;
  startsAtUtc: string;
  endsAtUtc: string;
  startMinute: number;
  endMinute: number;
  bookings: WorkspaceScheduleBooking[];
  replies: { confirmed: number; pending: number; cancelled: number };
};

export function workspaceAgendaSessions(
  schedule: WorkspaceSchedule,
): WorkspaceAgendaSession[] {
  const groups = new Map<string, WorkspaceAgendaSession>();
  const timezone = schedule.availability.timezone;
  for (const booking of schedule.bookings) {
    const start = new Date(booking.starts_at);
    const end = new Date(booking.ends_at);
    const date = workspaceDateKey(start, timezone);
    const key = booking.group_session_id
      ? `${booking.group_session_id}:${start.toISOString()}:${end.toISOString()}`
      : booking.id;
    let session = groups.get(key);
    if (!session) {
      session = {
        id: key,
        groupSessionId: booking.group_session_id,
        date,
        startsAtUtc: start.toISOString(),
        endsAtUtc: end.toISOString(),
        startMinute: workspaceMinuteOfDay(start, timezone),
        endMinute:
          workspaceDateKey(end, timezone) === date
            ? workspaceMinuteOfDay(end, timezone)
            : 1440,
        bookings: [],
        replies: { confirmed: 0, pending: 0, cancelled: 0 },
      };
      groups.set(key, session);
    }
    session.bookings.push({ ...booking });
    if (booking.status === 'confirmed') session.replies.confirmed += 1;
    if (booking.status === 'proposed') session.replies.pending += 1;
    if (
      booking.status === 'cancelled_by_client' ||
      booking.status === 'cancelled_by_trainer'
    )
      session.replies.cancelled += 1;
  }
  return [...groups.values()].sort(
    (a, b) =>
      Date.parse(a.startsAtUtc) - Date.parse(b.startsAtUtc) ||
      a.id.localeCompare(b.id),
  );
}

export function workspaceFreeWindows(
  schedule: WorkspaceSchedule,
  date: string,
): { startMinute: number; endMinute: number }[] {
  const { availability } = schedule;
  const day = new Date(`${date}T12:00:00Z`);
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== date
  )
    throw new RangeError('Invalid calendar date');
  if (!availability.working_days.includes((day.getUTCDay() + 6) % 7)) return [];
  const minutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const lower = minutes(availability.day_start);
  const upper = minutes(availability.day_end);
  const occupied = workspaceAgendaSessions(schedule)
    .filter(
      (session) =>
        session.date === date &&
        session.bookings.some(
          (booking) =>
            booking.status === 'proposed' || booking.status === 'confirmed',
        ),
    )
    .map((session) => ({
      start: Math.max(lower, session.startMinute),
      end: Math.min(upper, session.endMinute),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const windows: { startMinute: number; endMinute: number }[] = [];
  let cursor = lower;
  for (const interval of occupied) {
    if (interval.start > cursor)
      windows.push({ startMinute: cursor, endMinute: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < upper) windows.push({ startMinute: cursor, endMinute: upper });
  return windows;
}

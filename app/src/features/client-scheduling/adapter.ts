import {
  workspaceDateKey,
  workspaceMinuteOfDay,
} from '@/features/workspace-scheduling/clock';
import { scheduleClock } from '@/features/workspace-scheduling/screen-adapter';
import type {
  ClientBookingPlan,
  ClientSchedule,
  ClientScheduleBooking,
  ClientScheduleContext,
  ClientScheduleProposal,
} from './service';

export type ClientHomeBookingRow = {
  id: string;
  date: string;
  start: string;
  end: string;
  startsAtUtc: string;
  endsAtUtc: string;
  durationMinutes: number;
  status: 'proposed' | 'confirmed';
  hasProposal: boolean;
  group: boolean;
  programName: string | null;
  needsConfirmation: boolean;
  ongoing: boolean;
  today: boolean;
  proposal: ClientScheduleProposal | null;
  booking: ClientScheduleBooking;
};
export type ClientScheduleHome = {
  context: ClientScheduleContext;
  today: string;
  clock: string;
  bookings: ClientHomeBookingRow[];
  next: ClientHomeBookingRow | null;
  pendingProposals: ClientScheduleProposal[];
};
export function clientBookingPlanDetail(
  plan: ClientBookingPlan | null,
): ClientBookingPlan | null {
  return plan
    ? {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        exercises: [...plan.exercises]
          .sort((a, b) => a.position - b.position)
          .map((line) => ({
            ...line,
            instructions_snapshot: [...line.instructions_snapshot],
          })),
      }
    : null;
}
const cloneBooking = (
  booking: ClientScheduleBooking,
): ClientScheduleBooking => ({
  ...booking,
  program: clientBookingPlanDetail(booking.program),
});
const active = (booking: ClientScheduleBooking) =>
  booking.status === 'proposed' || booking.status === 'confirmed';
export function clientScheduleHome(
  schedule: ClientSchedule,
  now: Date,
): ClientScheduleHome {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp)) throw new RangeError('Invalid current date');
  const timezone = schedule.context.timezone;
  const today = workspaceDateKey(now, timezone);
  const pendingProposals = schedule.pendingProposals
    .filter((proposal) => active(proposal.booking))
    .map((proposal) => ({
      ...proposal,
      booking: cloneBooking(proposal.booking),
    }));
  const bookings = schedule.bookings
    .filter(
      (booking) => active(booking) && Date.parse(booking.ends_at) > timestamp,
    )
    .sort(
      (a, b) =>
        Date.parse(a.starts_at) - Date.parse(b.starts_at) ||
        a.id.localeCompare(b.id),
    )
    .map((booking): ClientHomeBookingRow => {
      const start = new Date(booking.starts_at);
      const end = new Date(booking.ends_at);
      const date = workspaceDateKey(start, timezone);
      return {
        id: booking.id,
        date,
        start: scheduleClock(workspaceMinuteOfDay(start, timezone)),
        end:
          workspaceDateKey(end, timezone) === date
            ? scheduleClock(workspaceMinuteOfDay(end, timezone))
            : '24:00',
        startsAtUtc: start.toISOString(),
        endsAtUtc: end.toISOString(),
        durationMinutes: (end.getTime() - start.getTime()) / 60000,
        status: booking.status === 'proposed' ? 'proposed' : 'confirmed',
        hasProposal: pendingProposals.some(
          (proposal) => proposal.bookingId === booking.id,
        ),
        group: booking.group_session_id !== null,
        programName: booking.program?.name ?? null,
        needsConfirmation: booking.status === 'proposed',
        ongoing: start.getTime() <= timestamp && timestamp < end.getTime(),
        today: date === today,
        proposal:
          pendingProposals.find(
            (proposal) => proposal.bookingId === booking.id,
          ) ?? null,
        booking: cloneBooking(booking),
      };
    });
  return {
    context: { ...schedule.context },
    today,
    clock: scheduleClock(workspaceMinuteOfDay(now, timezone)),
    bookings,
    next: bookings[0] ?? null,
    pendingProposals,
  };
}

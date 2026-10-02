import type { ScheduleSession } from '../trainer-schedule/demo';
import { workspaceAgendaSessions, workspaceFreeWindows } from './agenda';
import { workspaceDateKey, workspaceMinuteOfDay } from './clock';
import type { WorkspaceSchedule } from './service';

export const scheduleClock = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export function workspaceScheduleRows(
  schedule: WorkspaceSchedule,
  groupTitle: string,
): ScheduleSession[] {
  return workspaceAgendaSessions(schedule)
    .filter(
      (session) => session.replies.confirmed + session.replies.pending > 0,
    )
    .map((session) => {
      const proposal = schedule.pendingProposals.find(
        (item) =>
          item.authorRole === 'client' &&
          session.bookings.some((booking) => booking.id === item.booking_id),
      );
      const programNames = session.bookings.map(
        (booking) => booking.program_name,
      );
      const programName = programNames[0];
      return {
        id: session.id,
        ...(programName && programNames.every((name) => name === programName)
          ? { programName }
          : {}),
        date: session.date,
        start: scheduleClock(session.startMinute),
        end: scheduleClock(session.endMinute),
        person: session.groupSessionId ? 'group' : 'newClient',
        title: session.groupSessionId
          ? groupTitle
          : (session.bookings[0]?.client_name ?? ''),
        participantIds: session.bookings.map(
          (booking) => booking.client_record_id,
        ),
        participantNames: session.bookings.map(
          (booking) => booking.client_name,
        ),
        pending: session.replies.pending > 0,
        status: session.replies.pending > 0 ? 'proposed' : 'confirmed',
        replies: { ...session.replies },
        ...(proposal
          ? {
              request: {
                date: workspaceDateKey(
                  new Date(proposal.proposed_starts_at),
                  schedule.availability.timezone,
                ),
                time: scheduleClock(
                  workspaceMinuteOfDay(
                    new Date(proposal.proposed_starts_at),
                    schedule.availability.timezone,
                  ),
                ),
              },
            }
          : {}),
      };
    });
}

export const workspaceScheduleWindows = (
  schedule: WorkspaceSchedule,
  date: string,
) =>
  workspaceFreeWindows(schedule, date).map((window) => ({
    date,
    start: scheduleClock(window.startMinute),
    end: scheduleClock(window.endMinute),
  }));

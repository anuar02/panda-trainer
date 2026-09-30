import {
  currentSchedulingRequest,
  type SchedulingState,
} from '@/domain/scheduling';
import type { ScheduleSession } from '@/features/trainer-schedule/demo';

export function scheduleRows(state: SchedulingState): ScheduleSession[] {
  const people = {
    c1: 'aigerim',
    c2: 'arman',
    c3: 'aliya',
    c4: 'madi',
    c5: 'dana',
    c6: 'newClient',
    c7: 'newClient',
  } as const;
  const programs = {
    'Низ А': 'lower',
    'Верх Б': 'upper',
    'Full Body': 'fullBody',
    'Сила 5×5': 'strength',
  } as const;
  return state.sessions
    .filter((session) => session.status !== 'cancelled')
    .map((session) => {
      const request = currentSchedulingRequest(state, session.id);
      const target = request?.counter ?? request?.to;
      return {
        id: session.id,
        date: session.date,
        start: session.start,
        end: session.end,
        person:
          session.kind === 'group'
            ? 'group'
            : people[session.clientId as keyof typeof people],
        program: session.program
          ? programs[session.program as keyof typeof programs]
          : undefined,
        programName: session.program ?? undefined,
        title: session.title,
        participantIds: session.participants.map((p) => p.clientId),
        replies: {
          confirmed: session.participants.filter((p) => p.reply === 'confirmed')
            .length,
          pending: session.participants.filter((p) => p.reply === 'pending')
            .length,
          cancelled: session.participants.filter((p) => p.reply === 'cancelled')
            .length,
        },
        pending: session.participants.some((p) => p.reply === 'pending'),
        ...(target
          ? { request: { date: target.date, time: target.start } }
          : {}),
      };
    });
}

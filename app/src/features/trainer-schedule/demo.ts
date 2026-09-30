export const scheduleToday = '2026-09-14';

export type ScheduleSession = {
  id: string;
  date: string;
  start: string;
  end: string;
  person:
    'dana' | 'madi' | 'arman' | 'aigerim' | 'group' | 'aliya' | 'newClient';
  program?: 'fullBody' | 'upper' | 'strength' | 'lower';
  request?: { date: string; time: string };
  title?: string;
  participantIds?: string[];
  pending?: boolean;
  replies?: { confirmed: number; pending: number; cancelled: number };
};

export const scheduleSessions: readonly ScheduleSession[] = [
  {
    id: 's1',
    date: scheduleToday,
    start: '09:00',
    end: '10:00',
    person: 'dana',
    program: 'fullBody',
  },
  {
    id: 's2',
    date: scheduleToday,
    start: '11:30',
    end: '12:30',
    person: 'madi',
    program: 'upper',
  },
  {
    id: 's3',
    date: scheduleToday,
    start: '14:00',
    end: '15:00',
    person: 'arman',
    program: 'strength',
  },
  {
    id: 's4',
    date: scheduleToday,
    start: '18:00',
    end: '19:00',
    person: 'aigerim',
    program: 'lower',
  },
  {
    id: 's5',
    date: scheduleToday,
    start: '18:30',
    end: '19:30',
    person: 'arman',
    program: 'strength',
  },
  {
    id: 's6',
    date: scheduleToday,
    start: '20:00',
    end: '21:00',
    person: 'group',
  },
  {
    id: 's7',
    date: scheduleToday,
    start: '21:15',
    end: '22:00',
    person: 'aigerim',
  },
  {
    id: 's8',
    date: '2026-09-17',
    start: '18:00',
    end: '19:00',
    person: 'aigerim',
    program: 'lower',
    request: { date: '2026-09-18', time: '19:00' },
  },
  {
    id: 's9',
    date: '2026-09-15',
    start: '14:00',
    end: '15:00',
    person: 'arman',
    program: 'strength',
    request: { date: '2026-09-16', time: '11:30' },
  },
];

export function shiftDate(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function weekDates(date: string) {
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, index) =>
    shiftDate(date, index - weekday),
  );
}

export function minutes(time: string) {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function agendaClusters(sessions: readonly ScheduleSession[]) {
  const clusters: {
    start: number;
    end: number;
    sessions: ScheduleSession[];
  }[] = [];
  [...sessions]
    .sort((a, b) => a.start.localeCompare(b.start))
    .forEach((session) => {
      const last = clusters[clusters.length - 1];
      const start = minutes(session.start);
      const end = minutes(session.end);
      if (last && start < last.end) {
        last.sessions.push(session);
        last.end = Math.max(last.end, end);
      } else clusters.push({ start, end, sessions: [session] });
    });
  return clusters;
}

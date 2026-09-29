export type TodayScenario = 'normal' | 'empty' | 'loading' | 'offline';
export type DemoSession = {
  id: string;
  start: string;
  end: string;
  person: 'dana' | 'madi' | 'arman' | 'aigerim';
  program: 'fullBody' | 'upper' | 'strength' | 'lower' | null;
  title: 'morning' | 'personal' | 'stretch';
};
export const demoPastSessions: readonly DemoSession[] = [
  {
    id: 's1',
    start: '09:00',
    end: '10:00',
    person: 'dana',
    program: 'fullBody',
    title: 'morning',
  },
  {
    id: 's2',
    start: '11:30',
    end: '12:30',
    person: 'madi',
    program: 'upper',
    title: 'personal',
  },
  {
    id: 's3',
    start: '14:00',
    end: '15:00',
    person: 'arman',
    program: 'strength',
    title: 'personal',
  },
  {
    id: 's4',
    start: '18:00',
    end: '19:00',
    person: 'aigerim',
    program: 'lower',
    title: 'personal',
  },
  {
    id: 's5',
    start: '18:30',
    end: '19:30',
    person: 'arman',
    program: 'strength',
    title: 'personal',
  },
];
export const demoLastSession: DemoSession = {
  id: 's7',
  start: '21:15',
  end: '22:00',
  person: 'aigerim',
  program: null,
  title: 'stretch',
};

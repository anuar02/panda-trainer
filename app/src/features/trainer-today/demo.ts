export type TodayScenario = 'normal' | 'empty' | 'loading' | 'offline';
export type DemoSession = {
  id: string;
  start: string;
  end: string;
  person: 'dana' | 'madi' | 'arman' | 'aigerim';
  program: 'fullBody' | 'upper' | 'strength' | 'lower' | null;
  title: 'morning' | 'personal' | 'stretch';
};

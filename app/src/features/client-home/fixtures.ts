export type HomeScenario = 'normal' | 'empty' | 'loading' | 'offline';
export const homeBookings = [
  {
    id: 's7',
    dateKey: 'todayDate',
    start: '21:15',
    end: '22:00',
    programKey: 'onsite',
    today: true,
  },
  {
    id: 's8',
    dateKey: 'futureDate',
    start: '18:00',
    end: '19:00',
    programKey: 'program',
    today: false,
  },
] as const;
export const homePackage = { remaining: 7, bought: 12 };

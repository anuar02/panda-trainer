import { trainerClients } from './ru';

export type ClientFilter = 'all' | 'due' | 'unscheduled';
export type DemoClient = {
  id: keyof typeof trainerClients.people;
  phone: string;
  remaining: number | null;
  due: number;
  next: { date: 'today' | 'september15'; time: string; group: boolean } | null;
};

export const demoClients: DemoClient[] = [
  {
    id: 'c1',
    phone: '+7 701 214 88 03',
    remaining: 7,
    due: 40000,
    next: { date: 'today', time: '21:15', group: false },
  },
  {
    id: 'c2',
    phone: '+7 702 550 11 47',
    remaining: 2,
    due: 0,
    next: { date: 'september15', time: '14:00', group: false },
  },
  {
    id: 'c3',
    phone: '+7 705 380 92 16',
    remaining: 9,
    due: 0,
    next: { date: 'today', time: '20:00', group: true },
  },
  { id: 'c4', phone: '+7 747 102 34 90', remaining: 1, due: 6000, next: null },
  {
    id: 'c5',
    phone: '+7 700 918 77 25',
    remaining: 5,
    due: 0,
    next: { date: 'today', time: '20:00', group: true },
  },
  { id: 'c6', phone: '+7 708 441 60 38', remaining: null, due: 0, next: null },
  { id: 'c7', phone: '', remaining: null, due: 0, next: null },
];

export function filterClients(
  people: DemoClient[],
  query: string,
  filter: ClientFilter,
  name: (person: DemoClient) => string,
) {
  const normalized = query.trim().toLocaleLowerCase('ru');
  const digits = normalized.replace(/\D/g, '') || '!';
  return people
    .filter(
      (person) =>
        (filter === 'all' ||
          (filter === 'due' ? person.due > 0 : !person.next)) &&
        (!normalized ||
          name(person).toLocaleLowerCase('ru').includes(normalized) ||
          person.phone.replace(/\D/g, '').includes(digits)),
    )
    .sort((a, b) => name(a).localeCompare(name(b), 'ru'));
}

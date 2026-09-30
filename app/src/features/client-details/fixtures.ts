import type { DemoClient } from '../trainer-clients/demo';

type Details = {
  completed: number;
  joined: string;
  purchase?: {
    price: number;
    paid: number;
    units: number;
    used: number;
    expires: string | null;
    date: string;
  };
};
export const clientDetailsFixtures: Record<DemoClient['id'], Details> = {
  c1: {
    completed: 31,
    joined: '2025-03-11',
    purchase: {
      price: 60000,
      paid: 20000,
      units: 12,
      used: 5,
      expires: '2026-11-28',
      date: '2026-08-28',
    },
  },
  c2: {
    completed: 14,
    joined: '2026-01-20',
    purchase: {
      price: 44000,
      paid: 44000,
      units: 8,
      used: 6,
      expires: '2026-10-14',
      date: '2026-07-14',
    },
  },
  c3: { completed: 8, joined: '2026-05-04' },
  c4: {
    completed: 19,
    joined: '2026-04-02',
    purchase: {
      price: 24000,
      paid: 18000,
      units: 4,
      used: 3,
      expires: null,
      date: '2026-09-01',
    },
  },
  c5: {
    completed: 21,
    joined: '2026-02-17',
    purchase: {
      price: 60000,
      paid: 60000,
      units: 12,
      used: 7,
      expires: '2026-10-10',
      date: '2026-06-10',
    },
  },
  c6: { completed: 0, joined: '2026-09-12' },
  c7: { completed: 0, joined: '2026-09-18' },
};

export type DetailsRecord = {
  exercise: string;
  date: string;
  sets: number;
  top: number;
  unit: string;
};
const records = (
  exercise: string,
  sets: number,
  entries: [string, number][],
): DetailsRecord[] =>
  entries.map(([date, top]) => ({ exercise, date, sets, top, unit: 'кг' }));
export const detailsHistory: Partial<
  Record<DemoClient['id'], DetailsRecord[]>
> = {
  c1: [
    ...records('Приседания со штангой', 4, [
      ['2026-08-19', 75],
      ['2026-08-26', 80],
      ['2026-09-02', 80],
      ['2026-09-09', 82.5],
    ]),
    ...records('Румынская тяга', 3, [
      ['2026-08-19', 55],
      ['2026-08-26', 57.5],
      ['2026-09-02', 60],
      ['2026-09-09', 60],
    ]),
  ],
  c2: records('Приседания со штангой', 5, [
    ['2026-08-20', 95],
    ['2026-08-27', 97.5],
    ['2026-09-03', 100],
    ['2026-09-10', 100],
  ]),
  c4: records('Жим лёжа', 4, [
    ['2026-08-21', 65],
    ['2026-08-28', 67.5],
    ['2026-09-04', 70],
    ['2026-09-11', 70],
  ]),
};

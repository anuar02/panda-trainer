import {
  routeScalar,
  routeDate,
  routeTime,
  routeClientId,
} from '../src/features/scheduling-demo/route-params';

test('repeated query parameters use their first scalar rather than leaking arrays', () => {
  expect(routeDate(['2026-09-15', 'garbage'])).toBe('2026-09-15');
  expect(routeTime(['21:00', '22:00'])).toBe('21:00');
  expect(routeClientId(['c1', 'c2'])).toBe('c1');
  expect(routeDate(['garbage', '2026-09-15'])).toBeUndefined();
});

test.each([undefined, null, '', [], [null], [['2026-09-15']], {}, 42])(
  'non-scalar input %p falls back safely',
  (value) => {
    expect(routeScalar(value)).toBeUndefined();
    expect(routeDate(value)).toBeUndefined();
    expect(routeTime(value)).toBeUndefined();
    expect(routeClientId(value)).toBeUndefined();
  },
);

test.each([
  'garbage',
  '2026-02-29',
  '2026-04-31',
  '2026-13-01',
  '2026-00-01',
  '2026-9-14',
  '2026-09-14T12:00:00Z',
])('invalid date %s cannot reach date rendering', (value) => {
  expect(routeDate(value)).toBeUndefined();
});

test('valid past dates and leap days remain available for browsing', () => {
  expect(routeDate('2024-02-29')).toBe('2024-02-29');
  expect(routeDate('2026-09-14')).toBe('2026-09-14');
});

test.each(['24:00', '25:30', '20:60', '9:00', '19:00:00', 'invalid'])(
  'invalid start %s falls back to editor default',
  (value) => {
    expect(routeTime(value)).toBeUndefined();
  },
);

test('only existing client ids can preselect a client or enter details', () => {
  expect(routeClientId('c6')).toBe('c6');
  expect(routeClientId('missing')).toBeUndefined();
  expect(routeClientId('constructor')).toBeUndefined();
  expect(routeClientId('__proto__')).toBeUndefined();
});

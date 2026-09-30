import { i18n } from '../src/lib/i18n';

test.each([
  [1, '1 подход'],
  [2, '2 подхода'],
  [5, '5 подходов'],
  [11, '11 подходов'],
  [21, '21 подход'],
  [24, '24 подхода'],
])(
  'Russian workout count %i works with the native plural polyfill',
  (count, label) => {
    expect(i18n.t('workout.sets', { count })).toBe(label);
  },
);
test('shared Russian plural rules support schedule and library counts', () => {
  expect(i18n.t('trainerSchedule.sessions', { count: 3 })).not.toContain(
    'trainerSchedule.',
  );
  expect(i18n.t('trainerLibrary.sets', { count: 3 })).toBe('3 подхода');
  expect(new Intl.PluralRules('ru').select(4)).toBe('few');
  expect(new Intl.PluralRules('ru').select(11)).toBe('many');
});

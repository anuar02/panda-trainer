import {
  createTrainerOnboardingDraft,
  getWelcomeDaysLabel,
  getWelcomeNameError,
  toTrainerOnboardingPayload,
  toggleWelcomeDay,
  toggleWelcomeFocus,
} from '../src/features/onboarding/welcome-model';

describe('trainer welcome model', () => {
  it('starts with the prototype defaults and no fabricated identity or client', () => {
    expect(createTrainerOnboardingDraft()).toEqual({
      name: '',
      focus: ['Силовые'],
      days: [0, 1, 2, 3, 4, 5],
      from: '07:00',
      to: '21:00',
      length: 60,
      clientName: '',
      clientPhone: '',
    });
  });

  it('toggles focus and valid workdays without mutating their inputs', () => {
    const focus = ['Силовые'];
    const days = [0, 1, 2];

    expect(toggleWelcomeFocus(focus, 'Йога')).toEqual(['Силовые', 'Йога']);
    expect(toggleWelcomeFocus(focus, 'Силовые')).toEqual([]);
    expect(toggleWelcomeDay(days, 1)).toEqual([0, 2]);
    expect(toggleWelcomeDay(days, 4)).toEqual([0, 1, 2, 4]);
    expect(toggleWelcomeDay(days, 7)).toEqual(days);
    expect(focus).toEqual(['Силовые']);
    expect(days).toEqual([0, 1, 2]);
  });

  it('formats selected days like the prototype summary', () => {
    expect(getWelcomeDaysLabel([])).toBe('дни не выбраны');
    expect(getWelcomeDaysLabel([0, 1, 2, 3, 4, 5])).toBe('пн–сб');
    expect(getWelcomeDaysLabel([0, 2, 4])).toBe('пн, ср, пт');
  });

  it('requires a nonblank trainer name before saving', () => {
    expect(getWelcomeNameError('  ')).toBe('nameRequired');
    expect(getWelcomeNameError(' Алия ')).toBeNull();
  });

  it('normalizes persisted values and drops a phone without a client card', () => {
    const draft = createTrainerOnboardingDraft(' Алия ');
    const payload = toTrainerOnboardingPayload({
      ...draft,
      focus: ['Силовые', 'Силовые'],
      days: [4, 2, 4, 8],
      clientPhone: ' +7 700 000 00 00 ',
    });

    expect(payload).toEqual({
      ...draft,
      name: 'Алия',
      focus: ['Силовые'],
      days: [2, 4],
      clientPhone: '',
    });
  });

  it('keeps a normalized phone only when a client card has a name', () => {
    const draft = createTrainerOnboardingDraft('Алия');

    expect(
      toTrainerOnboardingPayload({
        ...draft,
        clientName: ' Айгерим Бекова ',
        clientPhone: ' +7 700 000 00 00 ',
      }),
    ).toMatchObject({
      clientName: 'Айгерим Бекова',
      clientPhone: '+7 700 000 00 00',
    });
  });
});

export const welcomeFocusOptions = [
  'Силовые',
  'Функциональные',
  'Похудение',
  'Реабилитация',
  'Бокс',
  'Йога',
] as const;

export const welcomeDays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;
export const welcomeStartTimes = [
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
] as const;
export const welcomeEndTimes = [
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
] as const;
export const welcomeSessionLengths = [45, 60, 90] as const;

export type TrainerOnboardingDraft = {
  name: string;
  focus: string[];
  days: number[];
  from: string;
  to: string;
  length: number;
  clientName: string;
  clientPhone: string;
};

export type WelcomeNameError = 'nameRequired';

export function createTrainerOnboardingDraft(
  name = '',
): TrainerOnboardingDraft {
  return {
    name,
    focus: ['Силовые'],
    days: [0, 1, 2, 3, 4, 5],
    from: '07:00',
    to: '21:00',
    length: 60,
    clientName: '',
    clientPhone: '',
  };
}

export function toggleWelcomeFocus(
  focus: readonly string[],
  value: string,
): string[] {
  return focus.includes(value)
    ? focus.filter((item) => item !== value)
    : [...focus, value];
}

export function toggleWelcomeDay(
  days: readonly number[],
  value: number,
): number[] {
  if (!Number.isInteger(value) || value < 0 || value >= welcomeDays.length)
    return [...days];
  return days.includes(value)
    ? days.filter((day) => day !== value)
    : [...days, value].sort((a, b) => a - b);
}

export function getWelcomeDaysLabel(days: readonly number[]): string {
  const valid = [...new Set(days)]
    .filter(
      (day) => Number.isInteger(day) && day >= 0 && day < welcomeDays.length,
    )
    .sort((a, b) => a - b);
  if (!valid.length) return 'дни не выбраны';
  const consecutive = valid.every((day, index) => {
    if (index === 0) return true;
    const previous = valid[index - 1];
    return previous !== undefined && day === previous + 1;
  });
  if (consecutive && valid.length > 2) {
    const first = valid[0];
    const last = valid[valid.length - 1];
    if (first !== undefined && last !== undefined)
      return `${welcomeDays[first]}–${welcomeDays[last]}`;
  }
  return valid.map((day) => welcomeDays[day]).join(', ');
}

export function getWelcomeNameError(name: string): WelcomeNameError | null {
  return name.trim() ? null : 'nameRequired';
}

export function toTrainerOnboardingPayload(
  draft: TrainerOnboardingDraft,
): TrainerOnboardingDraft {
  const clientName = draft.clientName.trim();
  return {
    name: draft.name.trim(),
    focus: [...new Set(draft.focus)],
    days: [...new Set(draft.days)]
      .filter(
        (day) => Number.isInteger(day) && day >= 0 && day < welcomeDays.length,
      )
      .sort((a, b) => a - b),
    from: draft.from,
    to: draft.to,
    length: draft.length,
    clientName,
    clientPhone: clientName ? draft.clientPhone.trim() : '',
  };
}

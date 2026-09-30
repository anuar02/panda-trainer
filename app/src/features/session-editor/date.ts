import { useTranslation } from 'react-i18next';

export function useEditorDate() {
  const { t } = useTranslation();
  const weekdays = t('sessionEditor.weekdays', { returnObjects: true });
  const months = t('sessionEditor.months', { returnObjects: true });
  return (date: string) => {
    const value = new Date(`${date}T12:00:00Z`);
    if (!Number.isFinite(value.getTime())) return date;
    const day = (value.getUTCDay() + 6) % 7;
    return `${weekdays[day]}, ${value.getUTCDate()} ${months[value.getUTCMonth()]}`;
  };
}

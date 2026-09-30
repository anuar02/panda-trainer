import { useTranslation } from 'react-i18next';
import { useOptionalWorkoutDemo } from './provider';

export function useJournalLabels() {
  const { t } = useTranslation();
  const workout = useOptionalWorkoutDemo();
  const journal = (id: string) => workout?.state.sessions[id];
  return {
    label: (id: string) =>
      t(
        journal(id)?.finished
          ? 'trainerToday.results'
          : journal(id)
            ? 'trainerToday.resume'
            : 'trainerToday.start',
      ),
    status: (id: string) =>
      journal(id)
        ? t(
            journal(id)?.finished
              ? 'trainerToday.journalFinished'
              : 'trainerToday.journalDraft',
          )
        : null,
    draft: (id: string) => Boolean(journal(id) && !journal(id)?.finished),
    dockSessionId: workout?.state.activeSessionId,
  };
}

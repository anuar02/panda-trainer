import { useTranslation } from 'react-i18next';
import {
  workspaceDateKey,
  workspaceMinuteOfDay,
} from '@/features/workspace-scheduling/clock';
import { scheduleClock } from '@/features/workspace-scheduling/screen-adapter';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { View } from 'react-native';
import { ClientHistoryScreen } from './client-history-screen';
import { useClientHistory } from './use-history';

type Props = {
  userId: string;
  workspaceId: string;
  clientRecordId: string;
  trainerName: string;
};
export function ClientConnectedHistoryScreen(props: Props) {
  return (
    <ClientConnectedHistoryContent
      key={`${props.userId}:${props.workspaceId}:${props.clientRecordId}`}
      {...props}
    />
  );
}
function ClientConnectedHistoryContent(props: Props) {
  const { t } = useTranslation();
  const read = useClientHistory({
    userId: props.userId,
    clientRecordId: props.clientRecordId,
  });
  const context = read.history?.context;
  if (read.error || (context && context.workspaceId !== props.workspaceId))
    return (
      <Screen title={t('common.error')}>
        <Button label={t('common.retry')} onPress={read.retry} />
      </Screen>
    );
  const timezone = context?.timezone ?? 'UTC';
  return (
    <ClientHistoryScreen
      data={{
        trainerName: context?.trainerName ?? props.trainerName,
        timezone,
        loading: read.loading,
        rows: (read.history?.journals ?? []).map((journal) => ({
          id: journal.id,
          date: workspaceDateKey(new Date(journal.startedAtUtc), timezone),
          start: scheduleClock(
            workspaceMinuteOfDay(new Date(journal.startedAtUtc), timezone),
          ),
          exercises: journal.exercises.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            measure: exercise.measure,
            bodyweight: exercise.bodyweight,
            skipped: exercise.skipped,
            replaced: journal.exercises.some(
              (child) => child.replacedFromId === exercise.id,
            ),
            sets: exercise.sets.map((result) => ({
              id: result.id,
              position: result.position,
              reps: result.reps,
              seconds: result.seconds,
              weightGrams: result.weightG,
            })),
          })),
          notes: journal.notes.map((note) => ({
            id: note.id,
            text: note.text,
          })),
        })),
        footer:
          read.hasMore || read.moreError ? (
            <View className="gap-2 px-4 pb-5">
              {read.moreError ? (
                <Text accessibilityRole="alert">{t('common.error')}</Text>
              ) : null}
              <Button
                label={
                  read.moreError
                    ? t('common.retry')
                    : t('clientHistory.loadMore')
                }
                loading={read.loadingMore}
                onPress={() =>
                  void (read.moreError ? read.retryMore() : read.loadMore())
                }
              />
            </View>
          ) : null,
      }}
    />
  );
}

import { workoutExerciseKey } from '@/domain/workout/library';
import { View } from 'react-native';
import { useState, useLayoutEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { ClientProgressVisits } from './client-progress-visits';
import { ClientExerciseHistory } from './exercise-history';
import { useClientReadInvalidation } from '../client-home/use-read-invalidation';
import { useTranslation } from 'react-i18next';
import { useWorkspaceClock } from '@/features/workspace-scheduling/use-clock';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';
import { ClientProgressScreen } from './client-progress-screen';
import { clientHistoryProgress } from './adapter';
import { useClientProgress } from './use-progress';
import type { ClientProgressHistory } from './service';

type Props = {
  userId: string;
  workspaceId: string;
  clientRecordId: string;
  trainerName: string;
};
export function ClientConnectedProgressScreen(props: Props) {
  return (
    <ClientConnectedProgressContent
      key={`${props.userId}:${props.workspaceId}:${props.clientRecordId}`}
      {...props}
    />
  );
}
function ClientConnectedProgressContent(props: Props) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<{
    value: { name: string; unit: 'сек' | 'повт' };
    history: ClientProgressHistory;
  } | null>(null);
  useClientReadInvalidation(
    useCallback(() => {
      setOffset(0);
      setSelected(null);
    }, []),
  );
  useFocusEffect(
    useCallback(() => {
      setSelected(null);
      setOffset(0);
    }, []),
  );
  const now = useWorkspaceClock();
  const read = useClientProgress({
    userId: props.userId,
    clientRecordId: props.clientRecordId,
    workspaceId: props.workspaceId,
  });
  const currentData = useRef(read.data);
  useLayoutEffect(() => {
    currentData.current = read.loading ? null : read.data;
  }, [read.data, read.loading]);
  const context = read.loading ? null : read.data?.context;
  const progress = read.data ? clientHistoryProgress(read.data, now) : null;
  const unranked = [
    ...new Map(
      (read.data?.journals ?? []).flatMap((journal) =>
        journal.exercises.map((exercise) => {
          const unit =
            exercise.measure === 'seconds'
              ? ('сек' as const)
              : ('повт' as const);
          return [
            `${workoutExerciseKey(exercise.name)}:${unit}`,
            { name: exercise.name, unit },
          ] as const;
        }),
      ),
    ).entries(),
  ].filter(([key]) => !progress?.results.some((result) => result.key === key));
  if (
    read.error ||
    (context &&
      (context.workspaceId !== props.workspaceId ||
        context.clientRecordId !== props.clientRecordId)) ||
    (progress && !progress.complete)
  )
    return (
      <Screen title={t('common.error')}>
        <Button label={t('common.retry')} onPress={read.retry} />
      </Screen>
    );
  return (
    <>
      <ClientProgressScreen
        data={{
          trainerName: context?.trainerName ?? props.trainerName,
          results: progress?.results ?? [],
          loading: read.loading,
          onSelectResult: (result) => {
            if (read.data && currentData.current === read.data)
              setSelected({ value: result, history: read.data });
          },
          footer: context ? (
            <>
              {unranked.length ? (
                <View className="gap-2 px-4">
                  {unranked.map(([key, exercise]) => (
                    <Button
                      key={key}
                      label={t('clientProgress.exerciseHistory', {
                        name: exercise.name,
                      })}
                      variant="soft"
                      onPress={() => {
                        if (read.data && currentData.current === read.data)
                          setSelected({ value: exercise, history: read.data });
                      }}
                    />
                  ))}
                </View>
              ) : null}
              <ClientProgressVisits
                {...props}
                timezone={context.timezone}
                now={now}
                offset={offset}
                onOffset={(value) => {
                  if (read.data && currentData.current === read.data)
                    setOffset(value);
                }}
              />
            </>
          ) : null,
        }}
      />
      {!read.loading && read.data ? (
        <ClientExerciseHistory
          key={JSON.stringify(
            read.data.journals.map((j) => [j.id, j.revision]),
          )}
          history={read.data}
          selected={selected?.history === read.data ? selected.value : null}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

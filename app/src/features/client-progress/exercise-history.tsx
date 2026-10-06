import { useState } from 'react';
import { Button } from '@/ui/button';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { workoutExerciseKey } from '@/domain/workout/library';
import { workspaceDateKey } from '../workspace-scheduling/clock';
import type { ClientHistory } from '../client-history/service';

function ClientExerciseHistoryContent({
  history,
  selected,
  onClose,
}: {
  history: ClientHistory;
  selected: { name: string; unit: 'сек' | 'повт' } | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [limit, setLimit] = useState(50);
  const number = (v: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }).format(
      v,
    );
  const rows = selected
    ? history.journals.flatMap((journal) =>
        journal.exercises
          .filter(
            (exercise) =>
              workoutExerciseKey(exercise.name) ===
                workoutExerciseKey(selected.name) &&
              (exercise.measure === 'seconds' ? 'сек' : 'повт') ===
                selected.unit,
          )
          .map((exercise) => ({ journal, exercise })),
      )
    : [];
  return (
    <Sheet
      open={selected !== null}
      title={selected?.name ?? t('clientProgress.title')}
      onClose={onClose}
    >
      {rows.slice(0, limit).map(({ journal, exercise }) => (
        <View key={`${journal.id}:${exercise.id}`} className="gap-2">
          <Text className="font-bold">
            {workspaceDateKey(
              new Date(journal.startedAtUtc),
              history.context.timezone,
            )}
          </Text>
          {exercise.sets.length === 0 ? (
            <Text>{t('clientHistory.noResults')}</Text>
          ) : (
            exercise.sets.map((set) => {
              const quantity =
                exercise.measure === 'seconds' ? set.seconds : set.reps;
              return (
                <View key={set.id} className="gap-1">
                  <Text>
                    {t('clientHistory.actualSet', {
                      position: set.position + 1,
                    })}
                  </Text>
                  <Text>
                    {quantity === null
                      ? t(
                          exercise.measure === 'seconds'
                            ? 'clientHistory.secondsMissing'
                            : 'clientHistory.repsMissing',
                        )
                      : t(
                          exercise.measure === 'seconds'
                            ? 'clientHistory.actualSeconds'
                            : 'clientHistory.actualReps',
                          { value: number(quantity) },
                        )}
                  </Text>
                  <Text>
                    {set.weightG === null
                      ? t('clientHistory.weightMissing')
                      : t('clientHistory.actualWeight', {
                          value: number(set.weightG / 1000),
                        })}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      ))}
      {rows.length > limit ? (
        <Button
          label={t('clientHistory.loadMore')}
          onPress={() => setLimit((v) => v + 50)}
        />
      ) : null}
    </Sheet>
  );
}

export function ClientExerciseHistory(
  props: Parameters<typeof ClientExerciseHistoryContent>[0],
) {
  return (
    <ClientExerciseHistoryContent
      key={`${props.selected?.name ?? ''}:${props.selected?.unit ?? ''}`}
      {...props}
    />
  );
}

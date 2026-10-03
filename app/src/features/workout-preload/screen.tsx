import { WorkoutSyncStatus } from '@/features/workout-sync';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ThemeProvider } from '@/ui/theme';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import type {
  PreloadExercise,
  PreloadSet,
} from '@/domain/workout-preload/types';
import { useOptionalWorkoutPreload } from './provider';

export function WorkoutPreloadScreen() {
  const preload = useOptionalWorkoutPreload();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const state = preload?.state;
  const participant =
    state?.status === 'ready'
      ? state.context?.participants.find(
          (value) => value.clientRecordId === state.recovery?.clientRecordId,
        )
      : undefined;
  const setLabel = (set: PreloadSet) =>
    [
      set.weightGrams === null
        ? t('workoutPreload.unknown')
        : t('workoutPreload.weight', { value: set.weightGrams / 1000 }),
      set.reps === null
        ? set.seconds === null
          ? t('workoutPreload.unknown')
          : t('workoutPreload.seconds', { value: set.seconds })
        : t('workoutPreload.reps', { value: set.reps }),
    ].join(' · ');
  const cards = (lines: PreloadExercise[]) => (
    <>
      {lines.map((exercise) => (
        <Card key={exercise.id}>
          <Text className="font-strong">{exercise.name}</Text>
          <Text>
            {t('workoutPreload.plan', {
              sets: exercise.plannedSets,
              target:
                exercise.measure === 'reps'
                  ? t('workoutPreload.reps', {
                      value:
                        exercise.plannedReps ?? t('workoutPreload.unknown'),
                    })
                  : t('workoutPreload.seconds', {
                      value:
                        exercise.plannedSeconds ?? t('workoutPreload.unknown'),
                    }),
            })}
          </Text>
          {exercise.plannedWeightGrams !== null ? (
            <Text>
              {t('workoutPreload.weight', {
                value: exercise.plannedWeightGrams / 1000,
              })}
            </Text>
          ) : null}
          {exercise.sets.map((set) => (
            <Text key={set.id}>{setLabel(set)}</Text>
          ))}
          {exercise.previousSets.length ? (
            <>
              <Text className="text-secondary">
                {t('workoutPreload.previous')}
              </Text>
              {exercise.previousSets.map((set) => (
                <Text key={set.id}>{setLabel(set)}</Text>
              ))}
            </>
          ) : null}
        </Card>
      ))}
    </>
  );
  return (
    <ThemeProvider role="trainer" workout>
      <Screen title={t('workoutPreload.title')}>
        <Button
          label={t('workoutPreload.collapse')}
          variant="ghost"
          disabled={
            state?.status === 'loading' ||
            state?.status === 'hydrating' ||
            Boolean(state?.error)
          }
          onPress={() => {
            void preload
              ?.collapse(true)
              .then(() => router.replace('/workspace/today'));
          }}
        />
        {state?.error || !participant ? (
          <Button
            label={t('workoutPreload.back')}
            variant="ghost"
            onPress={() => router.replace('/workspace/today')}
          />
        ) : null}
        {state?.status === 'loading' || state?.status === 'hydrating' ? (
          <Text>{t('workoutPreload.loading')}</Text>
        ) : null}
        {preload?.syncState ? (
          <WorkoutSyncStatus state={preload.syncState} />
        ) : null}
        {state?.error ? (
          <Card>
            <Text accessibilityRole="alert">
              {t(`workoutPreload.${state.error}`)}
            </Text>
            <Button
              label={t('common.retry')}
              onPress={() =>
                state.error === 'storage'
                  ? preload?.retry()
                  : router.replace('/workspace/today')
              }
            />
          </Card>
        ) : null}
        {participant ? (
          <>
            <Text>
              {t(
                state?.cached
                  ? 'workoutPreload.cached'
                  : 'workoutPreload.ready',
              )}
            </Text>
            <Text className="text-secondary">
              {t('workoutPreload.loaded', {
                date: new Date(state?.context?.loadedAt ?? '').toLocaleString(
                  i18n.language,
                ),
              })}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {state?.context?.participants.map((value) => (
                <Button
                  key={value.clientRecordId}
                  label={value.clientName}
                  variant={
                    value.clientRecordId === participant.clientRecordId
                      ? 'primary'
                      : 'ghost'
                  }
                  disabled={state.status !== 'ready' || Boolean(state.error)}
                  onPress={() => void preload?.select(value.clientRecordId)}
                />
              ))}
            </View>
            <Text className="font-heading text-title">
              {participant.programName}
            </Text>
            <Text accessibilityRole="alert">
              {t('workoutPreload.readonly')}
            </Text>
            <Text className="font-strong">{t('workoutPreload.assigned')}</Text>
            {cards(participant.assignedExercises)}
            {participant.workoutStatus !== 'not_created' ? (
              <>
                <Text className="font-strong">
                  {t('workoutPreload.current')}
                </Text>
                {cards(participant.exercises)}
              </>
            ) : null}
          </>
        ) : state?.status === 'ready' ? (
          <Text>{t('workoutPreload.unavailable')}</Text>
        ) : null}
      </Screen>
    </ThemeProvider>
  );
}

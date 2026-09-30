import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  workoutExerciseLibrary,
  type WorkoutAction,
  type WorkoutExercise,
  type WorkoutExerciseSpec,
} from '@/domain/workout';
import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { Icon, type IconName } from '@/ui/icons';
import { workoutStyles as s } from './measurements';

export type ExerciseSheetState = {
  mode: 'menu' | 'add' | 'replace';
  exerciseId?: string;
};

export function WorkoutExerciseSheet({
  selection,
  exercises,
  clientId,
  dispatch,
  onClose,
  savedCount,
}: {
  selection: ExerciseSheetState;
  exercises: WorkoutExercise[];
  clientId: string;
  dispatch: (action: WorkoutAction) => void;
  onClose: () => void;
  savedCount: number;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState(selection.mode);
  const [query, setQuery] = useState('');
  const target = exercises.find(
    (exercise) => exercise.id === selection.exerciseId,
  );
  const normalize = (value: string) =>
    value.toLowerCase().replace(/ё/g, 'е').trim();
  const filtered = workoutExerciseLibrary.filter((exercise) =>
    normalize([exercise.name, ...(exercise.aliases ?? [])].join(' ')).includes(
      normalize(query),
    ),
  );
  const pick = (spec: WorkoutExerciseSpec) => {
    if (mode === 'replace' && target)
      dispatch({
        type: 'replaceExercise',
        clientId,
        exerciseId: target.id,
        spec,
      });
    else dispatch({ type: 'addExercise', clientId, spec });
    onClose();
  };
  const menuItem = (
    icon: IconName,
    title: string,
    hint: string,
    onPress?: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={s.menuItem}
    >
      <Icon name={icon} size={20} color="#8c9eff" />
      <View style={s.grow}>
        <Text style={s.bold}>{title}</Text>
        <Text style={[s.small, s.secondary]}>{hint}</Text>
      </View>
    </Pressable>
  );
  return (
    <Sheet
      open
      title={
        mode === 'menu'
          ? (target?.name ?? '')
          : mode === 'replace'
            ? t('workout.replaceTitle', { name: target?.name ?? '' })
            : t('workout.addExercise')
      }
      onClose={onClose}
    >
      <Text style={s.secondary}>
        {t(
          mode === 'menu'
            ? 'workout.changeHint'
            : mode === 'replace'
              ? 'workout.replaceHint'
              : 'workout.addHint',
        )}
      </Text>
      {mode === 'menu' && target ? (
        <>
          {menuItem(
            'dumbbell',
            t('workout.technique'),
            t('workout.techniqueHint'),
          )}
          {menuItem(
            'swap',
            t('workout.replace'),
            savedCount
              ? t('workout.keepSaved', { count: savedCount })
              : t('workout.busyEquipment'),
            () => setMode('replace'),
          )}
          {menuItem(
            'plus',
            t('workout.addSetMenu'),
            t('workout.setsNow', { count: target.sets }),
            () => {
              dispatch({ type: 'addSet', clientId, exerciseId: target.id });
              onClose();
            },
          )}
          {menuItem(
            'ban',
            t(
              target.origin === 'added' && !savedCount
                ? 'workout.removeExercise'
                : 'workout.skip',
            ),
            t(
              target.origin === 'added' && !savedCount
                ? 'workout.noSets'
                : savedCount
                  ? 'workout.omitMissing'
                  : 'workout.canRestore',
            ),
            () => {
              dispatch({
                type: 'skipExercise',
                clientId,
                exerciseId: target.id,
              });
              onClose();
            },
          )}
        </>
      ) : (
        <>
          <TextInput
            accessibilityLabel={t('workout.searchExercise')}
            placeholder={t('workout.exercisePlaceholder')}
            placeholderTextColor="#a3a4ab"
            value={query}
            onChangeText={setQuery}
            style={s.pickerInput}
          />
          {filtered.map((item) => (
            <Pressable
              key={item.name}
              testID={`workout-pick-${item.name}`}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              disabled={item.name === target?.name}
              accessibilityState={{ disabled: item.name === target?.name }}
              style={[
                s.pickerItem,
                item.name === target?.name && { opacity: 0.45 },
              ]}
              onPress={() => pick(item)}
            >
              <View style={s.grow}>
                <Text style={s.bold}>{item.name}</Text>
                <Text style={[s.small, s.secondary]}>
                  {item.group}
                  {exercises.some(
                    (exercise) =>
                      !exercise.skipped && exercise.name === item.name,
                  )
                    ? ` · ${t('workout.alreadyAdded')}`
                    : ''}
                </Text>
              </View>
            </Pressable>
          ))}
          {!filtered.length && (
            <Text style={s.secondary}>{t('workout.noExercise')}</Text>
          )}
          {!!query.trim() &&
            !workoutExerciseLibrary.some(
              (item) => normalize(item.name) === normalize(query),
            ) && (
              <Button
                variant="soft"
                label={t('workout.createExercise', { name: query.trim() })}
                onPress={() => pick({ name: query.trim() })}
              />
            )}
        </>
      )}
    </Sheet>
  );
}

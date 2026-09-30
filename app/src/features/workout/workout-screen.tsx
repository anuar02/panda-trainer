import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  getWorkoutSession,
  parseWorkoutSet,
  workoutClients,
  workoutEligible,
  workoutProgress,
  type WorkoutAction,
  type WorkoutDraft,
  type WorkoutExercise,
  type WorkoutJournal,
  type WorkoutSet,
} from '@/domain/workout';
import { Button } from '@/ui/button';
import { GradientBackground } from '@/ui/gradient-background';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { workoutStyles as s } from './measurements';

type Props = {
  sessionId: string;
  scenario?: 'normal' | 'empty' | 'loading' | 'offline';
  journal: WorkoutJournal | null;
  dispatch: (action: WorkoutAction) => void;
  onMinimize: () => void;
  onLeave: () => void;
  hydrated?: boolean;
  readonly?: boolean;
  storageError?: boolean;
  readError?: boolean;
  saving?: boolean;
  onRetrySave?: () => void;
};
type Editor = { exerciseId: string; index: number; clientId: string };

export function WorkoutScreen({
  sessionId,
  scenario = 'normal',
  journal,
  dispatch,
  onMinimize,
  onLeave,
  hydrated = true,
  readonly = false,
  storageError = false,
  readError = false,
  saving = false,
  onRetrySave,
}: Props) {
  const { t, i18n } = useTranslation();
  const [focused, setFocused] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const session = getWorkoutSession(sessionId);
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language).format(value);
  const formatSet = (value: WorkoutSet, exercise: WorkoutExercise) =>
    value.kg
      ? `${number(value.kg)} кг × ${value.reps}`
      : `${value.reps} ${exercise.unit}`;
  const disabledProps = {
    disabled: true,
    accessibilityState: { disabled: true },
    accessibilityHint: t('workout.unavailable'),
  } as const;

  if (!hydrated)
    return (
      <SafeAreaView style={s.root}>
        <ActivityIndicator accessibilityLabel={t('workout.saving')} />
      </SafeAreaView>
    );
  if (readError)
    return (
      <SafeAreaView style={s.root} testID={`workout-${scenario}`}>
        <View style={s.complete}>
          <Text accessibilityRole="alert">{t('workout.readError')}</Text>
          {onRetrySave && (
            <Button label={t('workout.retryLoad')} onPress={onRetrySave} />
          )}
          <Button
            variant="soft"
            label={t('workout.return')}
            onPress={onLeave}
          />
        </View>
      </SafeAreaView>
    );
  if (!session || !journal)
    return (
      <SafeAreaView style={s.root} testID={`workout-${scenario}`}>
        <View style={s.complete}>
          <Text style={s.title}>{t('workout.choose')}</Text>
          <Text>{t('workout.chooseHint')}</Text>
          <Button label={t('workout.schedule')} onPress={onLeave} />
        </View>
      </SafeAreaView>
    );

  const active = journal.active;
  const plan = journal.plans[active];
  const client = workoutClients[active];
  const clientName = client?.name ?? '';
  const exercises = plan?.exercises ?? [];
  const progress = workoutProgress(journal);
  const eligible = workoutEligible(journal, active);
  const interactive = !journal.finished && eligible && !readonly;
  const values = (exercise: WorkoutExercise) =>
    journal.values[active]?.[exercise.id] ?? [];
  const nextIndex = (exercise: WorkoutExercise) =>
    Array.from({ length: exercise.sets }).findIndex(
      (_, i) => !values(exercise)[i],
    );
  const focus =
    exercises.find((exercise) => exercise.id === focused) ??
    exercises.find((exercise) => nextIndex(exercise) >= 0);
  const next = focus
    ? (exercises
        .slice(exercises.indexOf(focus) + 1)
        .find((exercise) => nextIndex(exercise) >= 0) ??
      exercises.find(
        (exercise) => exercise !== focus && nextIndex(exercise) >= 0,
      ))
    : undefined;
  const index = focus ? nextIndex(focus) : -1;
  const draftOf = (
    exercise: WorkoutExercise,
    setIndex: number,
    sheet = false,
  ): WorkoutDraft => {
    const draft = journal.drafts[active]?.[exercise.id]?.[setIndex];
    const saved = values(exercise)[setIndex];
    const previous = values(exercise)
      .slice(0, setIndex)
      .filter((value): value is WorkoutSet => value !== null)
      .at(-1);
    const value = saved ?? previous ?? exercise.prev;
    return (
      draft ??
      (sheet && !saved
        ? { kg: '', reps: '' }
        : { kg: String(value.kg), reps: String(value.reps) })
    );
  };
  const updateDraft = (
    exercise: WorkoutExercise,
    setIndex: number,
    draft: WorkoutDraft,
  ) => {
    if (!interactive) return;
    setError(false);
    dispatch({
      type: 'draft',
      clientId: active,
      exerciseId: exercise.id,
      setIndex,
      draft,
    });
  };
  const save = (exercise: WorkoutExercise, setIndex: number, sheet = false) => {
    if (!interactive) return;
    const value = parseWorkoutSet(exercise, draftOf(exercise, setIndex, sheet));
    if (!value) {
      setError(true);
      return;
    }
    dispatch({
      type: 'save',
      clientId: active,
      exerciseId: exercise.id,
      setIndex,
      value,
    });
    setError(false);
    setEditor(null);
    if (
      values(exercise).filter(Boolean).length +
        (values(exercise)[setIndex] ? 0 : 1) >=
      exercise.sets
    )
      setFocused(null);
  };
  const openEditor = (exercise: WorkoutExercise, setIndex: number) => {
    if (!interactive) return;
    setError(false);
    setEditor({ exerciseId: exercise.id, index: setIndex, clientId: active });
  };
  const fields = (
    exercise: WorkoutExercise,
    setIndex: number,
    sheet = false,
  ) => {
    const draft = draftOf(exercise, setIndex, sheet);
    return (
      <View style={s.fields}>
        {(['kg', 'reps'] as const)
          .filter((field) => field !== 'kg' || exercise.prev.kg !== 0)
          .map((field) => {
            const label = t(
              field === 'kg'
                ? 'workout.weight'
                : exercise.unit === 'сек'
                  ? 'workout.seconds'
                  : 'workout.reps',
            );
            const step =
              field === 'kg' ? 2.5 : exercise.unit === 'сек' && !sheet ? 5 : 1;
            const adjust = (direction: number) => {
              const parsed = Number(draft[field].replace(',', '.'));
              const current =
                draft[field].trim() && Number.isFinite(parsed)
                  ? parsed
                  : exercise.prev[field];
              updateDraft(exercise, setIndex, {
                ...draft,
                [field]: String(
                  Math.max(field === 'kg' ? 0 : 1, current + direction * step),
                ),
              });
            };
            return (
              <View key={field} style={s.field}>
                <Text style={s.fieldLabel}>{label}</Text>
                <TextInput
                  accessibilityLabel={label}
                  testID={`workout-${sheet ? 'editor' : 'composer'}-${field}`}
                  editable={interactive}
                  value={draft[field]}
                  placeholder={String(exercise.prev[field])}
                  placeholderTextColor="#84858d"
                  keyboardType={field === 'kg' ? 'decimal-pad' : 'number-pad'}
                  selectTextOnFocus
                  style={s.input}
                  onChangeText={(value) =>
                    updateDraft(exercise, setIndex, {
                      ...draft,
                      [field]: value,
                    })
                  }
                />
                <View style={s.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('workout.decrease', {
                      label,
                      step: number(step),
                    })}
                    style={s.step}
                    onPress={() => adjust(-1)}
                  >
                    <Icon name="minus" size={20} color="#f2f2f3" />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('workout.increase', {
                      label,
                      step: number(step),
                    })}
                    style={s.step}
                    onPress={() => adjust(1)}
                  >
                    <Icon name="plus" size={20} color="#f2f2f3" />
                  </Pressable>
                </View>
              </View>
            );
          })}
      </View>
    );
  };
  const goal = (exercise: WorkoutExercise) =>
    t('workout.goal', {
      sets: exercise.plannedSets,
      reps: exercise.reps,
      weight: exercise.target ? ` · ${number(exercise.target)} кг` : '',
    });
  const selectedExercise =
    editor?.clientId === active
      ? exercises.find((exercise) => exercise.id === editor.exerciseId)
      : undefined;
  const dateValue = new Date(`${session.date}T12:00:00Z`);
  const weekdays = t('workout.weekdays', { returnObjects: true });
  const months = t('workout.months', { returnObjects: true });
  const date = `${weekdays[dateValue.getUTCDay()]}, ${dateValue.getUTCDate()} ${months[dateValue.getUTCMonth()]}`;
  const finish = () => {
    setError(false);
    dispatch({ type: 'finish' });
    setFocused(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={s.root}
      testID={`workout-${scenario}`}
    >
      <View style={s.topbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            journal.finished ? 'workout.return' : 'workout.minimizeLabel',
          )}
          onPress={journal.finished ? onLeave : onMinimize}
          style={s.topSide}
        >
          <Icon
            name={journal.finished ? 'chevL' : 'chevD'}
            size={18}
            color="#f2f2f3"
          />
          {!journal.finished && (
            <Text style={[s.small, s.bold]}>{t('workout.minimize')}</Text>
          )}
        </Pressable>
        <Text style={s.topTitle}>
          {t(journal.finished ? 'workout.results' : 'workout.title')}
        </Text>
        <View style={[s.topSide, { width: 44, justifyContent: 'flex-end' }]}>
          <Pressable
            {...disabledProps}
            accessibilityRole="button"
            accessibilityLabel={t('workout.more')}
            style={[s.icon, { opacity: 0.45 }]}
          >
            <Icon name="more" size={20} color="#f2f2f3" />
          </Pressable>
        </View>
      </View>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 12 }}
      >
        <View style={s.head}>
          <View style={[s.row, { alignItems: 'flex-end' }]}>
            <View style={s.grow}>
              <Text accessibilityRole="header" style={s.title}>
                {session.kind === 'personal' ? client?.name : session.title}
              </Text>
              <Text style={s.subtitle}>
                {`${date} · ${session.start}–${session.end}`}
                {Object.keys(journal.plans).length === 1
                  ? ` · ${plan?.name ?? t('workout.noProgram')}`
                  : ''}
              </Text>
            </View>
            {!journal.finished &&
              Object.keys(journal.plans).length === 1 &&
              progress.total > 0 && (
                <Text
                  accessibilityLabel={t('workout.recorded', progress)}
                  style={s.score}
                >
                  {progress.done}
                  <Text style={s.scoreTotal}>{`/${progress.total}`}</Text>
                </Text>
              )}
          </View>
          {!journal.finished &&
            Object.keys(journal.plans).length === 1 &&
            progress.total > 0 && (
              <View style={s.progress}>
                <View
                  style={[
                    s.progressFill,
                    { width: `${(progress.done / progress.total) * 100}%` },
                  ]}
                />
              </View>
            )}
          {storageError && (
            <View style={{ gap: 8, marginTop: 12 }}>
              <Text accessibilityRole="alert" style={s.error}>
                {t('workout.storageError')}
              </Text>
              {onRetrySave && (
                <Button
                  compact
                  variant="soft"
                  label={t('workout.retry')}
                  onPress={onRetrySave}
                />
              )}
            </View>
          )}
          {journal.finished && (
            <View style={s.complete}>
              <Text style={s.secondary}>
                {plan?.name ?? t('workout.noProgram')}
              </Text>
              {progress.done > 0 && (
                <Text style={s.score}>{t('workout.recorded', progress)}</Text>
              )}
              <Text style={s.bold}>
                {t(progress.done ? 'workout.finished' : 'workout.emptyResults')}
              </Text>
              <Text style={s.secondary}>
                {t(
                  progress.done
                    ? 'workout.finishedHint'
                    : 'workout.emptyResultsHint',
                )}
              </Text>
              {progress.drafts > 0 && (
                <Text style={s.secondary}>
                  {t('workout.draftsOmitted', { count: progress.drafts })}
                </Text>
              )}
              <Text style={s.secondary}>{t('workout.attendance')}</Text>
            </View>
          )}
        </View>
        {Object.keys(journal.plans).length > 1 && (
          <>
            <ScrollView
              horizontal
              accessibilityLabel={t('workout.participants')}
              contentContainerStyle={s.participants}
            >
              {Object.entries(journal.plans).map(([id, participant]) => {
                const p = workoutProgress(journal, id);
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: id === active }}
                    onPress={() => {
                      dispatch({ type: 'switch', clientId: id });
                      setFocused(null);
                      setEditor(null);
                      setError(false);
                    }}
                    style={[
                      s.participant,
                      id === active && s.participantActive,
                    ]}
                  >
                    <Text style={s.bold}>{workoutClients[id]?.short}</Text>
                    <Text style={[s.small, s.secondary]}>
                      {workoutEligible(journal, id)
                        ? `${p.done}/${p.total}`
                        : t('workout.inactive')}
                    </Text>
                    {participant.reply === 'pending' && (
                      <Text style={[s.small, s.secondary]}>
                        {t('workout.pending')}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={[s.context, s.small]}>
              {t(
                journal.finished
                  ? 'workout.participantResults'
                  : 'workout.recording',
                { name: clientName },
              )}{' '}
              {`· ${plan?.name ?? t('workout.noProgram')}`}
            </Text>
          </>
        )}
        <View style={s.body}>
          {!eligible && (
            <Text style={s.secondary}>{t('workout.inactiveHint')}</Text>
          )}
          {interactive && focus && (
            <View style={s.focus}>
              <View style={s.eyebrow}>
                <Text style={s.eyebrowText}>
                  {t('workout.current', {
                    position: exercises.indexOf(focus) + 1,
                    total: exercises.length,
                  })}
                </Text>
                {next && (
                  <Pressable
                    accessibilityRole="button"
                    style={s.next}
                    onPress={() => {
                      setFocused(next.id);
                      setError(false);
                    }}
                  >
                    <Text numberOfLines={1} style={[s.small, s.secondary]}>
                      {t('workout.next', { name: next.name })}
                    </Text>
                    <Icon name="chevR" size={14} color="#a3a4ab" />
                  </Pressable>
                )}
              </View>
              <View style={s.exerciseHead}>
                <Text accessibilityRole="header" style={s.exerciseName}>
                  {focus.name}
                </Text>
                <Text style={s.exerciseGoal}>{goal(focus)}</Text>
                <Pressable
                  {...disabledProps}
                  accessibilityRole="button"
                  accessibilityLabel={t('workout.more')}
                  style={s.menu}
                >
                  <Icon name="more" size={20} color="#a3a4ab" />
                </Pressable>
              </View>
              <View style={s.chips}>
                {Array.from({ length: focus.sets }, (_, i) => {
                  const value = values(focus)[i];
                  return (
                    <Pressable
                      key={i}
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        value ? 'workout.editSet' : 'workout.recordSet',
                        { number: i + 1, name: focus.name },
                      )}
                      onPress={() => openEditor(focus, i)}
                      style={[s.chip, i === index && s.chipActive]}
                    >
                      <View style={[s.chipNo, i === index && s.chipNoActive]}>
                        <Text
                          style={[
                            s.chipNoText,
                            i === index && { color: '#ffffff' },
                          ]}
                        >
                          {i + 1}
                        </Text>
                      </View>
                      <Text style={[s.bold, i === index && s.accent]}>
                        {i === index
                          ? t('workout.now')
                          : value
                            ? formatSet(value, focus)
                            : '—'}
                      </Text>
                      {value && <Icon name="check" size={13} color="#3ddc97" />}
                    </Pressable>
                  );
                })}
              </View>
              {index >= 0 ? (
                <View style={s.composer}>
                  <View style={s.composerHead}>
                    <Text style={s.bold}>
                      {t('workout.set', { number: index + 1 })}
                    </Text>
                    <Text style={[s.small, s.secondary, s.grow]}>
                      {t(
                        journal.drafts[active]?.[focus.id]?.[index]
                          ? 'workout.draft'
                          : index > 0 && values(focus)[index - 1]
                            ? 'workout.lastSetSource'
                            : 'workout.previousSource',
                      )}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('workout.editSet', {
                        number: index + 1,
                        name: focus.name,
                      })}
                      style={s.composerEdit}
                      onPress={() => openEditor(focus, index)}
                    >
                      <Icon name="edit" size={17} color="#a3a4ab" />
                      <Text style={[s.small, s.secondary]}>
                        {t('workout.adjust')}
                      </Text>
                    </Pressable>
                  </View>
                  {fields(focus, index)}
                  {error && !editor && (
                    <Text accessibilityRole="alert" style={s.error}>
                      {t('workout.error')}
                    </Text>
                  )}
                  <Button
                    label={t('workout.saveSet', { number: index + 1 })}
                    icon={<Icon name="check" size={20} color="#ffffff" />}
                    onPress={() => save(focus, index)}
                  />
                </View>
              ) : (
                <View style={s.complete}>
                  <Text>{t('workout.setsComplete')}</Text>
                </View>
              )}
              <View style={s.foot}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('workout.addSetLabel', {
                    name: focus.name,
                  })}
                  style={s.addSet}
                  onPress={() =>
                    dispatch({
                      type: 'addSet',
                      clientId: active,
                      exerciseId: focus.id,
                    })
                  }
                >
                  <Icon name="plus" size={16} color="#8c9eff" />
                  <Text style={[s.small, s.bold, s.accent]}>
                    {t('workout.addSet')}
                  </Text>
                </Pressable>
                {focus.sets > focus.plannedSets &&
                  !values(focus)[focus.sets - 1] &&
                  !journal.drafts[active]?.[focus.id]?.[focus.sets - 1] && (
                    <Button
                      compact
                      variant="ghost"
                      label={t('workout.removeSet')}
                      onPress={() =>
                        dispatch({
                          type: 'removeSet',
                          clientId: active,
                          exerciseId: focus.id,
                        })
                      }
                    />
                  )}
              </View>
            </View>
          )}
          {interactive && !focus && exercises.length > 0 && (
            <View style={[s.focus, s.complete]}>
              <Text style={s.exerciseName}>{t('workout.complete')}</Text>
              <Text style={s.secondary}>{t('workout.completeHint')}</Text>
              <Button label={t('workout.finishFull')} onPress={finish} />
            </View>
          )}
          {!exercises.length && (
            <View style={s.complete}>
              <Text style={s.exerciseName}>{t('workout.emptyPlan')}</Text>
            </View>
          )}
          {interactive && exercises.length > 0 && (
            <View style={s.list}>
              <View
                style={[
                  s.row,
                  {
                    justifyContent: 'space-between',
                    marginTop: 4,
                    marginHorizontal: 4,
                  },
                ]}
              >
                <Text style={s.listTitle}>{t('workout.exercises')}</Text>
                <Text style={[s.small, s.bold, s.secondary]}>
                  {
                    exercises.filter((exercise) => nextIndex(exercise) < 0)
                      .length
                  }
                  {`/${exercises.length}`}
                </Text>
              </View>
              <View style={s.listRows}>
                {exercises.map((exercise, i) => {
                  const done = values(exercise).filter(
                    (value): value is WorkoutSet => value !== null,
                  );
                  return (
                    <Pressable
                      key={exercise.id}
                      accessibilityRole="button"
                      accessibilityLabel={exercise.name}
                      style={[
                        s.exerciseRow,
                        exercise === focus && s.exerciseActive,
                      ]}
                      onPress={() => {
                        setFocused(exercise.id);
                        setError(false);
                        scroll.current?.scrollTo({ y: 0, animated: false });
                      }}
                    >
                      <View
                        style={[s.mark, exercise === focus && s.markActive]}
                      >
                        {done.length === exercise.sets ? (
                          <Icon name="check" size={15} color="#3ddc97" />
                        ) : (
                          <Text style={s.bold}>{i + 1}</Text>
                        )}
                      </View>
                      <View style={s.grow}>
                        <Text style={s.bold}>{exercise.name}</Text>
                        <Text style={[s.small, s.secondary]}>
                          {done.length
                            ? done
                                .map((value) => formatSet(value, exercise))
                                .join(' · ')
                            : `${t('workout.sets', { count: exercise.sets })} · ${t('workout.previousSmall', { value: formatSet(exercise.prev, exercise) })}`}
                        </Text>
                      </View>
                      <Text style={[s.small, s.accent]}>
                        {exercise === focus
                          ? t('workout.now')
                          : `${done.length}/${exercise.sets}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                {...disabledProps}
                accessibilityRole="button"
                accessibilityLabel={t('workout.addExercise')}
                style={s.addExercise}
              >
                <Icon name="plus" size={18} color="#f2f2f3" />
                <Text>{t('workout.addExercise')}</Text>
              </Pressable>
            </View>
          )}
          {!interactive &&
            exercises.map((exercise) => {
              const saved = values(exercise);
              if (journal.finished && !saved.some(Boolean)) return null;
              return (
                <View style={s.focus} key={exercise.id}>
                  <View style={s.exerciseHead}>
                    <Text style={s.exerciseName}>{exercise.name}</Text>
                    <Text style={s.exerciseGoal}>
                      {journal.finished
                        ? t('workout.recorded', {
                            done: saved.filter(Boolean).length,
                            total: exercise.sets,
                          })
                        : goal(exercise)}
                    </Text>
                  </View>
                  {saved.map(
                    (value, i) =>
                      value && (
                        <View key={i} style={s.resultRow}>
                          <Text style={s.secondary}>{i + 1}</Text>
                          <View style={s.grow}>
                            <Text style={s.bold}>
                              {formatSet(value, exercise)}
                            </Text>
                            <Text style={[s.small, s.secondary]}>
                              {t('workout.previousSmall', {
                                value: formatSet(exercise.prev, exercise),
                              })}
                            </Text>
                          </View>
                          <Icon name="check" size={15} color="#3ddc97" />
                        </View>
                      ),
                  )}
                </View>
              );
            })}
        </View>
        {!journal.finished && (
          <Text style={s.footnote}>{t('workout.footnote')}</Text>
        )}
      </ScrollView>
      <View style={s.dock}>
        {!journal.finished && (
          <View style={s.feedback}>
            {saving && (
              <Text style={[s.small, s.secondary]}>{t('workout.saving')}</Text>
            )}
          </View>
        )}
        {journal.finished ? (
          <Button label={t('workout.return')} onPress={onLeave} />
        ) : (
          <View style={[s.row, { gap: 10 }]}>
            <Pressable
              {...disabledProps}
              accessibilityRole="button"
              accessibilityLabel={t('workout.voice')}
              style={s.voice}
            >
              <GradientBackground start="#2e4be0" end="#2136b0" radius={18} />
              <View style={s.voiceFace}>
                <Image
                  source={require('./face-smile.png')}
                  accessible={false}
                  style={{ width: 32, height: 28 }}
                />
                <View style={s.voiceMic}>
                  <Icon
                    name="mic"
                    size={12}
                    color="#6f86ff"
                    strokeWidth={2.6}
                  />
                </View>
              </View>
              <View>
                <Text style={s.bold}>{t('workout.voice')}</Text>
                <Text style={[s.small, { color: '#ffffff' }]}>
                  {t('workout.voiceHint')}
                </Text>
              </View>
            </Pressable>
            <Button
              variant="soft"
              label={t('workout.finish')}
              disabled={readonly || storageError}
              onPress={finish}
              style={s.finish}
            />
          </View>
        )}
      </View>
      <Sheet
        open={!!selectedExercise && !!editor}
        title={selectedExercise?.name ?? t('workout.title')}
        onClose={() => {
          setEditor(null);
          setError(false);
        }}
      >
        {selectedExercise && editor && (
          <>
            <Text style={s.secondary}>
              {t('workout.editorPerson', {
                name: clientName,
                number: editor.index + 1,
              })}
            </Text>
            <Text style={[s.small, s.secondary]}>
              {t('workout.editorHint')}
            </Text>
            {fields(selectedExercise, editor.index, true)}
            <Button
              variant="soft"
              label={`${t('workout.previous')} · ${formatSet(selectedExercise.prev, selectedExercise)}`}
              onPress={() =>
                updateDraft(selectedExercise, editor.index, {
                  kg: String(selectedExercise.prev.kg),
                  reps: String(selectedExercise.prev.reps),
                })
              }
            />
            <Text
              accessibilityRole={error ? 'alert' : undefined}
              style={error ? s.error : s.secondary}
            >
              {t(error ? 'workout.error' : 'workout.draftHint')}
            </Text>
            <Button
              label={t('workout.save')}
              onPress={() => save(selectedExercise, editor.index, true)}
            />
          </>
        )}
      </Sheet>
      <Sheet
        open={journal.finishPending}
        title={t('workout.finishTitle')}
        onClose={() => dispatch({ type: 'continueInput' })}
      >
        <Text style={s.secondary}>{t('workout.finishHint')}</Text>
        {Object.keys(journal.plans).map((id) => {
          const p = workoutProgress(journal, id);
          return (
            <View key={id}>
              <Text style={s.bold}>{workoutClients[id]?.short}</Text>
              <Text style={s.secondary}>
                {workoutEligible(journal, id)
                  ? t('workout.review', { ...p, missing: p.total - p.done })
                  : t('workout.inactive')}
              </Text>
            </View>
          );
        })}
        <Button
          label={t('workout.confirm')}
          disabled={storageError || readonly}
          onPress={() => {
            dispatch({ type: 'confirmPartial' });
            scroll.current?.scrollTo({ y: 0, animated: false });
          }}
        />
        <Button
          variant="soft"
          label={t('workout.continue')}
          onPress={() => dispatch({ type: 'continueInput' })}
        />
      </Sheet>
    </SafeAreaView>
  );
}

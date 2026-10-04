import { ProgramUpdatePanel } from '@/features/program-update/panel';
import { useState } from 'react';
import { Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import type {
  PreloadExercise,
  PreloadParticipant,
} from '@/domain/workout-preload/types';
import type { EntryDraft, SetValues } from '@/domain/workout-entry';
import type { JsonValue, SyncSession } from '@/domain/workout-sync/types';
import { Text } from '@/ui/text';
import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { getWorkoutStyles } from '@/features/workout/measurements';
import { WorkoutSyncStatus } from '@/features/workout-sync';
import { CorrectionPanel } from '@/features/workout-corrections';
import { useWorkoutEntry } from './use-entry';
import { entrySessionIdentity } from './session-identity';
import {
  summarizeWorkoutFinish,
  workoutFinishLocked,
} from '@/domain/workout-entry';

const emptyValues = (): SetValues => ({
  weightGrams: null,
  reps: null,
  seconds: null,
});
export function WorkoutEntryPanel(props: {
  session: SyncSession | null;
  getSession: () => SyncSession | null;
  participant: PreloadParticipant;
}) {
  const { session, participant } = props;
  const key = JSON.stringify([
    entrySessionIdentity(session),
    session?.accountId,
    session?.workspaceId,
    session?.sessionId,
    participant.workoutId,
    participant.bookingId,
    participant.clientRecordId,
  ]);
  return <WorkoutEntryContent key={key} {...props} />;
}

function WorkoutEntryContent({
  session,
  getSession,
  participant,
}: {
  session: SyncSession | null;
  getSession: () => SyncSession | null;
  participant: PreloadParticipant;
}) {
  const { t } = useTranslation();
  const { width, fontScale } = useWindowDimensions();
  const s = getWorkoutStyles(fontScale, width);
  const entry = useWorkoutEntry(session, getSession, participant);
  const [sheet, setSheet] = useState<
    'set' | 'add' | 'replace' | 'finish' | null
  >(null);
  const [editing, setEditing] = useState<Record<string, SetValues>>({});
  const [invalid, setInvalid] = useState(false);
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [corrected, setCorrected] = useState<{
    scope: string;
    participant: PreloadParticipant;
  } | null>(null);
  const correctionScope = `${session?.accountId}:${session?.workspaceId}:${session?.sessionId}:${participant.workoutId}:${participant.bookingId}:${participant.clientRecordId}`;
  const originalParticipant = entry.state?.workout.participant ?? participant;
  const p =
    corrected?.scope === correctionScope &&
    originalParticipant.workoutStatus === 'finished'
      ? corrected.participant
      : originalParticipant;
  const exercises = p.exercises.filter((exercise) => !exercise.skipped);
  const draft: EntryDraft = entry.state?.draft ?? {
    workoutId: p.workoutId,
    bookingId: p.bookingId,
    focusExerciseId: null,
    values: {},
  };
  const focus =
    exercises.find((exercise) => exercise.id === draft.focusExerciseId) ??
    exercises.find((exercise) => exercise.sets.length < exercise.plannedSets) ??
    exercises[0];
  const values = focus
    ? (editing[focus.id] ?? draft.values[focus.id] ?? emptyValues())
    : emptyValues();
  const finish = entry.state?.finish;
  const finished = finish?.status === 'applied';
  const finishPending = finish?.status === 'saved_on_phone';
  const notFinished = finish?.status === 'not_finished';
  const canContinue =
    notFinished &&
    entry.state !== null &&
    !workoutFinishLocked(entry.state.workout) &&
    p.workoutStatus === 'in_progress';
  const summary = summarizeWorkoutFinish(p, {
    ...draft,
    values: { ...draft.values, ...editing },
  });
  const recoveryDisabled = entry.busy || !entry.state;
  const disabled =
    recoveryDisabled ||
    (entry.state !== null && workoutFinishLocked(entry.state.workout)) ||
    (finish !== undefined && finish.status !== 'available' && !canContinue) ||
    p.workoutStatus !== 'in_progress';
  function change(next: SetValues, preserveRaw = false) {
    if (!preserveRaw) setRawInputs({});
    if (!focus) return;
    setEditing((current) => ({ ...current, [focus.id]: next }));
    setInvalid(false);
    void entry.execute(
      (service) =>
        service.saveDraft(p, {
          ...draft,
          focusExerciseId: focus.id,
          values: { ...draft.values, [focus.id]: next },
        }),
      false,
    );
  }
  function input(field: keyof SetValues, raw: string) {
    if (focus)
      setRawInputs((current) => ({
        ...current,
        [`${focus.id}:${field}`]: raw,
      }));
    const normalized = raw.trim().replace(',', '.');
    if (normalized === '') {
      change({ ...values, [field]: null }, true);
      return;
    }
    const valid =
      field === 'weightGrams'
        ? /^\d+(\.\d{0,3})?$/.test(normalized)
        : /^\d+$/.test(normalized);
    if (!valid) {
      setInvalid(true);
      return;
    }
    const parsed =
      field === 'weightGrams'
        ? Math.round(Number(normalized) * 1000)
        : Number(normalized);
    if (!Number.isSafeInteger(parsed)) {
      setInvalid(true);
      return;
    }
    change({ ...values, [field]: parsed }, true);
  }
  function fields(exercise: PreloadExercise) {
    const controls: { key: keyof SetValues; label: string; step: number }[] = [
      ...(!exercise.bodyweight
        ? [
            {
              key: 'weightGrams' as const,
              label: t('workoutEntry.weight'),
              step: 2500,
            },
          ]
        : []),
      {
        key: exercise.measure === 'reps' ? 'reps' : 'seconds',
        label: t(
          exercise.measure === 'reps'
            ? 'workoutEntry.reps'
            : 'workoutEntry.seconds',
        ),
        step: exercise.measure === 'reps' ? 1 : 5,
      },
    ];
    return (
      <View style={s.fields}>
        {controls.map(({ key, label, step }) => (
          <View key={key} style={s.field}>
            <Text style={s.fieldLabel}>{label}</Text>
            <TextInput
              accessibilityLabel={label}
              keyboardType={
                key === 'weightGrams' ? 'decimal-pad' : 'number-pad'
              }
              editable={!disabled}
              style={s.input}
              placeholder={t('workoutPreload.unknown')}
              placeholderTextColor="#a3a4ab"
              value={
                rawInputs[`${exercise.id}:${key}`] ??
                (values[key] === null
                  ? ''
                  : String(
                      key === 'weightGrams' ? values[key] / 1000 : values[key],
                    ))
              }
              onChangeText={(raw) => input(key, raw)}
            />
            <View style={s.row}>
              {[-step, step].map((delta) => (
                <Pressable
                  key={delta}
                  style={s.step}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    delta < 0 ? 'workoutEntry.less' : 'workoutEntry.more',
                    { label },
                  )}
                  onPress={() =>
                    change({
                      ...values,
                      [key]: Math.max(0, (values[key] ?? 0) + delta),
                    })
                  }
                >
                  <Text>
                    {t(delta < 0 ? 'workoutEntry.minus' : 'workoutEntry.plus')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }
  function versionLabel(value: JsonValue): string {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return t('workoutEntry.unknownVersion');
    const payload =
      value.payload &&
      typeof value.payload === 'object' &&
      !Array.isArray(value.payload)
        ? value.payload
        : value;
    const number = (key: string) =>
      typeof payload[key] === 'number' ? (payload[key] as number) : null;
    return `${format({ weightGrams: number('weight_g'), reps: number('reps'), seconds: number('seconds') })} · ${t('workoutEntry.device', { id: String(value.device_id ?? value.source_device_id ?? t('workoutPreload.unknown')) })}`;
  }
  const save = () => {
    if (!focus || invalid) return;
    void entry.execute(async (service, isCurrent = () => true) => {
      const confirmed = await service.confirm(p, focus.id, values);
      if (!isCurrent()) return;
      const nextDraft = {
        ...confirmed.draft,
        values: { ...confirmed.draft.values },
      };
      delete nextDraft.values[focus.id];
      await service.saveDraft(confirmed.workout.participant, nextDraft);
      if (!isCurrent()) return;
      setEditing((current) => {
        const next = { ...current };
        delete next[focus.id];
        return next;
      });
      setRawInputs({});
      setSheet(null);
      return service.read(confirmed.workout.participant);
    });
  };
  const recorded = exercises.flatMap((exercise) => exercise.sets);
  const last =
    [...(draft.localEntityIds ?? [])]
      .reverse()
      .map((id) => recorded.find((set) => set.id === id))
      .find(Boolean) ?? recorded.at(-1);
  const repeat =
    focus?.previousSets[
      Math.min(focus.sets.length, focus.previousSets.length - 1)
    ];
  const format = (set: SetValues) =>
    [
      set.weightGrams === null
        ? t('workoutPreload.unknown')
        : t('workoutPreload.weight', { value: set.weightGrams / 1000 }),
      set.reps === null
        ? t('workoutPreload.seconds', {
            value: set.seconds ?? t('workoutPreload.unknown'),
          })
        : t('workoutPreload.reps', { value: set.reps }),
    ].join(' · ');
  return (
    <View style={s.list}>
      {p.workoutStatus === 'finished' && (
        <CorrectionPanel
          key={`${session?.accountId}:${session?.workspaceId}:${session?.sessionId}:${p.workoutId}`}
          session={session}
          getSession={getSession}
          participant={p}
          onRefresh={async (refreshed) => {
            const current = getSession();
            if (
              session !== null &&
              current !== null &&
              current.accountId === session.accountId &&
              current?.workspaceId === session?.workspaceId &&
              current?.sessionId === session?.sessionId &&
              refreshed.workoutId === p.workoutId &&
              refreshed.bookingId === p.bookingId &&
              refreshed.clientRecordId === p.clientRecordId &&
              refreshed.workoutStatus === 'finished'
            )
              setCorrected({ scope: correctionScope, participant: refreshed });
          }}
        />
      )}
      {entry.sync && <WorkoutSyncStatus state={entry.sync} />}
      {!notFinished &&
        (entry.sync?.status === 'error' ||
          (entry.sync?.status === 'saved_on_phone' && entry.sync.pending > 0) ||
          finishPending) && (
          <Button
            label={t('common.retry')}
            disabled={recoveryDisabled}
            onPress={() => void entry.retryDelivery()}
          />
        )}
      {(entry.error || invalid) && (
        <Text accessibilityRole="alert" style={s.error}>
          {t(invalid ? 'workoutEntry.invalid' : 'workoutEntry.saveError')}
        </Text>
      )}
      {entry.error && (
        <Button label={t('common.retry')} onPress={entry.retry} />
      )}
      {p.workoutStatus !== 'in_progress' && !finished && (
        <Text>{t('workoutEntry.unprepared')}</Text>
      )}
      {focus &&
        !finished &&
        !finishPending &&
        (!notFinished || canContinue) && (
          <View style={s.focus}>
            <View style={s.eyebrow}>
              <Text style={s.eyebrowText}>
                {t('workoutEntry.now', {
                  index: exercises.indexOf(focus) + 1,
                  total: exercises.length,
                })}
              </Text>
            </View>
            <View style={s.exerciseHead}>
              <Text style={s.exerciseName}>{focus.name}</Text>
              <Text style={s.exerciseGoal}>
                {t('workoutPreload.plan', {
                  sets: focus.plannedSets,
                  target:
                    focus.plannedReps ??
                    focus.plannedSeconds ??
                    t('workoutPreload.unknown'),
                })}
              </Text>
            </View>
            <View style={s.chips}>
              {focus.sets.map((set, index) => (
                <Text key={set.id} style={s.chip}>
                  {t('workoutEntry.recordedValue', {
                    index: index + 1,
                    value: format(set),
                  })}
                </Text>
              ))}
            </View>
            <View style={s.composer}>
              <View style={s.composerHead}>
                <Text style={s.bold}>
                  {t('workoutEntry.set', { index: focus.sets.length + 1 })}
                </Text>
                <Text style={s.secondary}>
                  {t(
                    draft.values[focus.id] || editing[focus.id]
                      ? 'workoutEntry.draft'
                      : 'workoutEntry.hint',
                  )}
                </Text>
                <Button
                  label={t('workoutEntry.edit')}
                  variant="ghost"
                  disabled={disabled}
                  onPress={() => setSheet('set')}
                />
              </View>
              {fields(focus)}
              {repeat && (
                <Button
                  label={t('workoutEntry.repeat')}
                  variant="soft"
                  disabled={disabled}
                  onPress={() =>
                    change({
                      weightGrams: repeat.weightGrams,
                      reps: repeat.reps,
                      seconds: repeat.seconds,
                    })
                  }
                />
              )}
              <Button
                label={t('workoutEntry.save', { index: focus.sets.length + 1 })}
                disabled={disabled || invalid}
                onPress={save}
              />
            </View>
            <Button
              label={t('workoutEntry.replace')}
              variant="ghost"
              disabled={disabled || !entry.resources.catalog.length}
              onPress={() => setSheet('replace')}
            />
          </View>
        )}
      {last && !finished && !finishPending && (!notFinished || canContinue) && (
        <Button
          label={t('workoutEntry.undo')}
          variant="ghost"
          disabled={disabled}
          onPress={() =>
            void entry.execute((service) => service.undo(p, last.id))
          }
        />
      )}
      <Text style={s.listTitle}>{t('workoutEntry.exercises')}</Text>
      <View style={s.listRows}>
        {exercises.map((exercise) => (
          <Pressable
            key={exercise.id}
            style={[
              s.exerciseRow,
              exercise.id === focus?.id && s.exerciseActive,
            ]}
            accessibilityRole="button"
            accessibilityLabel={exercise.name}
            disabled={disabled}
            onPress={() =>
              void entry.execute(
                (service) =>
                  service.saveDraft(p, {
                    ...draft,
                    focusExerciseId: exercise.id,
                  }),
                false,
              )
            }
          >
            <Text style={s.bold}>{exercise.name}</Text>
            <Text style={s.secondary}>
              {t('workoutEntry.count', {
                done: exercise.sets.length,
                total: exercise.plannedSets,
              })}
            </Text>
          </Pressable>
        ))}
      </View>
      <Button
        label={t('workoutEntry.add')}
        variant="ghost"
        disabled={disabled || !entry.resources.catalog.length}
        onPress={() => setSheet('add')}
      />
      {(finished || finishPending || notFinished) && (
        <View style={s.complete}>
          <Text accessibilityRole="alert" style={s.bold}>
            {t(
              notFinished
                ? 'workoutEntry.finishNotFinished'
                : finished
                  ? 'workoutEntry.finishApplied'
                  : 'workoutEntry.finishLocal',
            )}
          </Text>
          <Text style={s.listTitle}>{t('workoutEntry.finishResults')}</Text>
          {p.exercises.map((exercise) => (
            <View key={exercise.id} style={s.list}>
              <Text style={s.bold}>{exercise.name}</Text>
              {exercise.sets
                .filter((set) => !set.deletedAt)
                .map((set) => (
                  <Text key={set.id}>{format(set)}</Text>
                ))}
            </View>
          ))}
        </View>
      )}
      {p.workoutStatus === 'finished' && (
        <ProgramUpdatePanel
          session={session}
          getSession={getSession}
          participant={p}
        />
      )}
      {!finished && !finishPending && (!notFinished || canContinue) && (
        <Button
          label={t('workoutEntry.finish')}
          disabled={
            disabled ||
            finish?.status === 'conflict' ||
            finish?.status === 'correction_draft' ||
            Boolean(entry.state?.issues.length) ||
            Boolean(entry.resources.conflicts.length)
          }
          onPress={() => {
            if (
              summary.unrecordedSets > 0 ||
              summary.draftCount > 0 ||
              summary.plannedSets === 0 ||
              invalid
            )
              setSheet('finish');
            else void entry.finish();
          }}
        />
      )}
      {finish?.status === 'error' && (
        <Text accessibilityRole="alert" style={s.error}>
          {t('workoutEntry.finishError')}
        </Text>
      )}
      {entry.state?.issues.map((issue) => (
        <Text key={issue.operation_id} accessibilityRole="alert">
          {t(
            `workoutEntry.${issue.status === 'error' ? 'rejected' : issue.status === 'correction_draft' ? 'correction' : 'conflict'}`,
          )}
        </Text>
      ))}
      {entry.resources.conflicts.map((conflict) => (
        <View key={conflict.id} style={s.composer}>
          <Text style={s.bold}>{t('workoutEntry.conflict')}</Text>
          <Text selectable>{versionLabel(conflict.current)}</Text>
          <Text selectable>{versionLabel(conflict.incoming)}</Text>
          {(['current', 'incoming'] as const).map((selection) => (
            <Button
              key={selection}
              label={t(`workoutEntry.${selection}`)}
              disabled={recoveryDisabled}
              onPress={() =>
                void entry.execute((service) =>
                  service.resolve(
                    p,
                    conflict.entityId,
                    conflict.id,
                    selection,
                    conflict.revision,
                  ),
                )
              }
            />
          ))}
        </View>
      ))}
      {sheet === 'finish' && (
        <Sheet
          open
          title={t('workoutEntry.finishTitle')}
          onClose={() => setSheet(null)}
        >
          <Text>{t('workoutEntry.finishHint')}</Text>
          <View style={s.listRows}>
            <View style={s.complete}>
              <Text style={s.bold}>{p.clientName}</Text>
              <Text style={s.secondary}>
                {t(
                  summary.plannedSets
                    ? 'workoutEntry.finishSummary'
                    : 'workoutEntry.finishEmpty',
                  {
                    done: summary.recordedSets,
                    total: summary.plannedSets,
                    missing: summary.unrecordedSets,
                  },
                )}
              </Text>
              {summary.draftCount > 0 && (
                <Text>
                  {t('workoutEntry.finishDrafts', {
                    count: summary.draftCount,
                  })}
                </Text>
              )}
            </View>
          </View>
          <Button
            label={t('workoutEntry.finishConfirm')}
            disabled={disabled}
            onPress={() => {
              setSheet(null);
              void entry.finish();
            }}
          />
          <Button
            label={t('workoutEntry.continueInput')}
            variant="soft"
            onPress={() => setSheet(null)}
          />
        </Sheet>
      )}
      {sheet === 'set' && focus && (
        <Sheet
          open
          title={focus.name}
          onClose={() => setSheet(null)}
          fixedContent={{
            header: (
              <Text>
                {t('workoutEntry.set', { index: focus.sets.length + 1 })}
              </Text>
            ),
            footer: (
              <>
                <Text>{t('workoutEntry.draftHint')}</Text>
                <Button
                  label={t('workoutEntry.save', {
                    index: focus.sets.length + 1,
                  })}
                  disabled={disabled || invalid}
                  onPress={save}
                />
              </>
            ),
          }}
        >
          <Text>{t('workoutEntry.greyHint')}</Text>
          {fields(focus)}
          {repeat && (
            <Button
              label={t('workoutEntry.repeat')}
              variant="soft"
              disabled={disabled}
              onPress={() =>
                change({
                  weightGrams: repeat.weightGrams,
                  reps: repeat.reps,
                  seconds: repeat.seconds,
                })
              }
            />
          )}
        </Sheet>
      )}
      {(sheet === 'add' || sheet === 'replace') && (
        <Sheet
          open
          title={t(
            sheet === 'add' ? 'workoutEntry.add' : 'workoutEntry.replace',
          )}
          onClose={() => setSheet(null)}
        >
          <Text>{t('workoutEntry.onlyHere')}</Text>
          {entry.resources.catalog.map((exercise) => (
            <Button
              key={exercise.exerciseId}
              label={exercise.name}
              variant="ghost"
              disabled={disabled || exercise.exerciseId === focus?.exerciseId}
              onPress={() =>
                void entry.execute(async (service, isCurrent = () => true) => {
                  const next = await service.add(
                    p,
                    exercise,
                    sheet === 'replace' ? focus?.id : undefined,
                  );
                  if (isCurrent()) setSheet(null);
                  return next;
                })
              }
            />
          ))}
        </Sheet>
      )}
    </View>
  );
}

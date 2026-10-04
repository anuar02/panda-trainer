import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { PreloadParticipant } from '@/domain/workout-preload/types';
import type { SyncSession } from '@/domain/workout-sync/types';
import { Text } from '@/ui/text';
import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { isRecord } from './validation';
import { useWorkoutCorrections } from './use-corrections';
import type { CorrectionReview } from './types';

function Version({ value, t }: { value: unknown; t: TFunction }) {
  if (!isRecord(value)) return <Text>{t('workoutCorrections.missing')}</Text>;
  const lines: string[] = [];
  if (typeof value.id === 'string')
    lines.push(t('workoutCorrections.entity', { id: value.id }));
  if (typeof value.device_id === 'string')
    lines.push(t('workoutCorrections.device', { device: value.device_id }));
  if (
    typeof value.exercise_name_snapshot === 'string' ||
    typeof value.exercise_id === 'string'
  )
    lines.push(
      t('workoutCorrections.exercise', {
        name: value.exercise_name_snapshot ?? value.exercise_id,
      }),
    );
  if ('weight_g' in value)
    lines.push(
      t('workoutCorrections.weight', {
        value: value.weight_g === null ? '—' : Number(value.weight_g) / 1000,
      }),
    );
  if ('reps' in value)
    lines.push(t('workoutCorrections.reps', { value: value.reps ?? '—' }));
  if ('seconds' in value)
    lines.push(
      t('workoutCorrections.seconds', { value: value.seconds ?? '—' }),
    );
  if (typeof value.planned_sets === 'number')
    lines.push(
      t('workoutCorrections.plannedSets', { value: value.planned_sets }),
    );
  if (typeof value.workout_exercise_id === 'string')
    lines.push(
      t('workoutCorrections.exercise', { name: value.workout_exercise_id }),
    );
  if (typeof value.replaced_from_id === 'string')
    lines.push(
      t('workoutCorrections.replacement', { id: value.replaced_from_id }),
    );
  if (typeof value.text === 'string') lines.push(value.text);
  if (typeof value.shared === 'boolean')
    lines.push(
      t(
        value.shared
          ? 'workoutCorrections.shared'
          : 'workoutCorrections.private',
      ),
    );
  if (value.deleted_at) lines.push(t('workoutCorrections.deleted'));
  return (
    <View className="gap-2">
      {lines.map((line, index) => (
        <Text key={index}>{line}</Text>
      ))}
      {isRecord(value.exercise) && <Version value={value.exercise} t={t} />}
      {Array.isArray(value.sets) &&
        value.sets.map((set, index) => (
          <Version key={`nested-set-${index}`} value={set} t={t} />
        ))}
      {Array.isArray(value.replacements) &&
        value.replacements.map((exercise, index) => (
          <Version key={`nested-replacement-${index}`} value={exercise} t={t} />
        ))}
    </View>
  );
}
function Review({ review, t }: { review: CorrectionReview; t: TFunction }) {
  const current = isRecord(review.current_version)
    ? review.current_version
    : null;
  const operation = review.operation;
  const conflict = isRecord(review.conflict) ? review.conflict : null;
  return (
    <View className="gap-3">
      <Text>{t(`workoutCorrections.operation.${operation.kind}`)}</Text>
      <Text>
        {t('workoutCorrections.finishedAt', { date: review.finished_at })}
      </Text>
      <Text>
        {t('workoutCorrections.revision', {
          revision: review.workout_revision,
        })}
      </Text>
      <Text className="font-semibold">{t('workoutCorrections.current')}</Text>
      <Version value={current?.entity} t={t} />
      {current?.exercise && <Version value={current.exercise} t={t} />}
      {Array.isArray(current?.sets) &&
        current.sets.map((set, index) => (
          <Version key={`set-${index}`} value={set} t={t} />
        ))}
      {Array.isArray(current?.replacements) &&
        current.replacements.map((exercise, index) => (
          <Version key={`replacement-${index}`} value={exercise} t={t} />
        ))}
      <Text className="font-semibold">{t('workoutCorrections.proposed')}</Text>
      <Text>
        {t('workoutCorrections.device', { device: operation.device_id })}
      </Text>
      <Text>{t('workoutCorrections.entity', { id: operation.entity_id })}</Text>
      {operation.kind === 'delete_set' ? (
        <Text>{t('workoutCorrections.deleted')}</Text>
      ) : (
        <Version value={operation.payload} t={t} />
      )}
      {operation.kind === 'resolve_conflict' && (
        <>
          <Text>
            {t('workoutCorrections.selected', {
              version: t(
                operation.payload.selected_version === 'current'
                  ? 'workoutCorrections.currentChoice'
                  : 'workoutCorrections.incoming',
              ),
            })}
          </Text>
          <Text className="font-semibold">
            {t('workoutCorrections.conflictCurrent')}
          </Text>
          <Version value={conflict?.current_version} t={t} />
          <Text className="font-semibold">
            {t('workoutCorrections.conflictIncoming')}
          </Text>
          <Version
            value={
              isRecord(conflict?.incoming_operation)
                ? {
                    ...(conflict.incoming_operation.payload as Record<
                      string,
                      unknown
                    >),
                    device_id: conflict.incoming_operation.device_id,
                  }
                : null
            }
            t={t}
          />
        </>
      )}
    </View>
  );
}
export function CorrectionPanel({
  session,
  getSession,
  participant,
  onRefresh,
}: {
  session: SyncSession | null;
  getSession: () => SyncSession | null;
  participant: PreloadParticipant;
  onRefresh?: (participant: PreloadParticipant) => Promise<void>;
}) {
  const { t } = useTranslation();
  const correction = useWorkoutCorrections(
    session,
    getSession,
    participant,
    onRefresh,
  );
  const errorLabel =
    correction.error === 'correction_conflict'
      ? 'workoutCorrections.conflict'
      : correction.error === 'correction_not_found'
        ? 'workoutCorrections.notFound'
        : correction.error === 'correction_stale'
          ? 'workoutCorrections.stale'
          : correction.error === 'correction_unavailable' ||
              correction.error === 'correction_session_changed'
            ? 'workoutCorrections.unavailable'
            : 'workoutCorrections.error';
  if (!session || participant.workoutStatus !== 'finished') return null;
  return (
    <View className="gap-3">
      <Text className="font-semibold">{t('workoutCorrections.title')}</Text>
      {correction.busy && <Text>{t('workoutCorrections.loading')}</Text>}
      {correction.applied && <Text>{t('workoutCorrections.applied')}</Text>}
      {correction.error && (
        <Text accessibilityRole="alert">{t(errorLabel)}</Text>
      )}
      {correction.pending && (
        <View className="gap-2">
          <Text>{t('workoutCorrections.uncertain')}</Text>
          <Text>
            {t('workoutCorrections.request', {
              id: correction.pending.requestId,
            })}
          </Text>
          <Text>
            {t('workoutCorrections.draft', { id: correction.pending.draftId })}
          </Text>
          <Text>
            {t('workoutCorrections.revision', {
              revision: correction.pending.expectedWorkoutRevision,
            })}
          </Text>
          <Text>
            {t('workoutCorrections.expectedEntityRevision', {
              revision: correction.pending.expectedEntityRevision,
            })}
          </Text>
          {correction.pending.expectedExerciseRevision !== null && (
            <Text>
              {t('workoutCorrections.expectedExerciseRevision', {
                revision: correction.pending.expectedExerciseRevision,
              })}
            </Text>
          )}
        </View>
      )}
      {!correction.busy &&
        !correction.reviews.length &&
        !correction.pending &&
        !correction.error && <Text>{t('workoutCorrections.empty')}</Text>}
      {correction.reviews.map((review) => (
        <Button
          key={review.draft_id}
          label={t('workoutCorrections.review')}
          variant="secondary"
          disabled={correction.busy || !!correction.pending}
          onPress={() => {
            void correction.review(review.draft_id);
          }}
        />
      ))}
      {correction.pending && (
        <Button
          label={t('workoutCorrections.retry')}
          disabled={correction.busy}
          onPress={() => {
            void correction.confirm();
          }}
        />
      )}
      {correction.error && !correction.pending && (
        <Button
          label={t('workoutCorrections.reload')}
          disabled={correction.busy}
          onPress={correction.reload}
        />
      )}
      <Sheet
        open={!!correction.selected}
        title={t('workoutCorrections.title')}
        onClose={correction.cancel}
      >
        <View className="gap-3">
          {correction.selected && <Review review={correction.selected} t={t} />}
          {correction.error && (
            <Text accessibilityRole="alert">{t(errorLabel)}</Text>
          )}
          <Button
            label={t(
              correction.pending
                ? 'workoutCorrections.retry'
                : 'workoutCorrections.confirm',
            )}
            loading={correction.busy}
            onPress={() => {
              void correction.confirm();
            }}
          />
          <Button
            label={t('workoutCorrections.cancel')}
            variant="secondary"
            disabled={correction.busy}
            onPress={correction.cancel}
          />
        </View>
      </Sheet>
    </View>
  );
}

import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SyncSession } from '@/domain/workout-sync/types';
import type { PreloadParticipant } from '@/domain/workout-preload/types';
import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { Icon } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import { Text } from '@/ui/text';
import { useProgramUpdate } from './use-update';
export function ProgramUpdatePanel({
  session,
  getSession,
  participant,
}: {
  session: SyncSession | null;
  getSession: () => SyncSession | null;
  participant: PreloadParticipant;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const update = useProgramUpdate(session, getSession, participant);
  const state = update.state;
  const name = participant.clientName;
  const format = (v: string | number | null | undefined) =>
    v ?? t('programUpdate.unknown');
  return (
    <View>
      {state?.context?.options.length ||
      state?.pending ||
      state?.error ||
      update.invalid ? (
        <Button
          variant="secondary"
          label={t('programUpdate.action')}
          onPress={update.open}
        />
      ) : null}
      {state?.applied && (
        <Text accessibilityRole="alert">
          {t('programUpdate.success', { name })}
        </Text>
      )}
      <Sheet
        open={update.opened}
        title={t('programUpdate.title', { name })}
        onClose={update.close}
      >
        <Text>{t('programUpdate.subtitle')}</Text>
        {state?.context?.options.map((option) => (
          <Pressable
            key={option.key}
            accessibilityRole="checkbox"
            accessibilityState={{
              checked: state.selected.includes(option.key),
              disabled: state.busy || !!state.pending,
            }}
            disabled={state.busy || !!state.pending}
            onPress={() => update.toggle(option.key)}
            className="min-h-11 py-3"
          >
            <View className="flex-row items-center gap-3">
              <View
                className="h-6 w-6 items-center justify-center rounded border"
                style={{ borderColor: colors.border }}
              >
                {state.selected.includes(option.key) && (
                  <Icon name="check" color={colors.accent} />
                )}
              </View>
              <Text>
                {t(`programUpdate.${option.kind}`, {
                  name: option.name,
                  old: option.old_name ?? option.name,
                  sets:
                    option.kind === 'add'
                      ? (option.planned_sets ?? option.fact.sets)
                      : option.fact.sets,
                  count:
                    option.kind === 'add'
                      ? (option.planned_sets ?? option.fact.sets ?? 0)
                      : (option.fact.sets ?? 0),
                  plan: option.plan.sets,
                })}
              </Text>
            </View>
            {(['plan', 'fact'] as const).map((kind) => (
              <Text key={kind}>
                {t(`programUpdate.${kind}`, {
                  sets: format(option[kind].sets),
                  weight: format(
                    option[kind].weight_g === null
                      ? null
                      : option[kind].weight_g / 1000,
                  ),
                  reps: format(option[kind].reps),
                  seconds: format(option[kind].seconds),
                })}
              </Text>
            ))}
          </Pressable>
        ))}
        {state?.error && (
          <Text accessibilityRole="alert">
            {t(
              `programUpdate.${state.error === 'update_conflict' || state.error === 'update_invalid' || state.error === 'update_unavailable' || state.error === 'update_read_error' || state.error === 'update_confirmed_pending' ? state.error : 'update_unknown'}`,
            )}
          </Text>
        )}
        {state?.error && !state.pending && (
          <Button
            label={t('common.retry')}
            onPress={() => void update.reload()}
            disabled={state.busy}
          />
        )}
        {state?.pending &&
          ['update_conflict', 'update_invalid', 'update_unavailable'].includes(
            state.error ?? '',
          ) && (
            <Button
              label={t('programUpdate.rejected')}
              onPress={() => void update.reject()}
              disabled={state.busy}
            />
          )}
        <Button
          label={
            state?.pending
              ? t('common.retry')
              : t('programUpdate.save', { name })
          }
          disabled={
            !state?.ready ||
            state.busy ||
            (!state.pending && state.selected.length === 0)
          }
          onPress={() => void update.confirm()}
        />
        <Text>
          {t('programUpdate.footnote', {
            name,
            program: state?.context?.program_name ?? participant.programName,
          })}
        </Text>
      </Sheet>
    </View>
  );
}

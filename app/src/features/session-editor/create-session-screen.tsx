import {
  MotionScrollView as ScrollView,
  MotionPressable as Pressable,
} from '@/ui/motion';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  createSessionDraft,
  patchSessionDraft,
  type SessionDraft,
} from '@/domain/scheduling';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { ChoiceRow, EditorChip, EditorLabel, EditorNotice } from './components';
import { useEditorDate } from './date';
import type { CreateSessionScreenProps } from './types';

export function CreateSessionScreen({
  clients,
  templates,
  dates,
  today,
  initialDate,
  initialDraft,
  initialStart,
  initialDuration,
  initialClientId,
  initialProgram,
  getCollisions,
  isStartAvailable,
  onCreate,
  onClose,
  disabled = false,
  storageError,
}: CreateSessionScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const dateLabel = useEditorDate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() =>
    initialDraft
      ? { ...initialDraft, clientIds: [...initialDraft.clientIds] }
      : createSessionDraft({
          date: initialDate ?? today,
          start: initialStart ?? '19:00',
          duration:
            initialDuration !== undefined &&
            [45, 60, 75, 90].includes(initialDuration)
              ? initialDuration
              : 60,
          clientIds: initialClientId ? [initialClientId] : [],
          program: templates.some(
            (template) => template.program === initialProgram,
          )
            ? initialProgram
            : null,
        }),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const blocked = disabled || busy;
  const patch = (next: Partial<SessionDraft>) => {
    if (disabled || locked.current) return;
    setDraft((current) => {
      const updated = patchSessionDraft(current, next);
      if (
        next.date !== undefined &&
        next.date !== current.date &&
        updated.start &&
        (getCollisions(updated).length > 0 ||
          isStartAvailable?.(updated) === false)
      )
        return patchSessionDraft(updated, { start: '' });
      return updated;
    });
    setError('');
  };
  const collisions = draft.start ? getCollisions(draft) : [];
  const previous = () => {
    if (disabled || locked.current) return;
    setStep((current) => Math.max(0, current - 1));
    setError('');
  };
  const save = () => {
    if (disabled || locked.current) return;
    locked.current = true;
    const finish = (message: string) => {
      locked.current = false;
      if (!mounted.current) return;
      setBusy(false);
      setError(message);
    };
    try {
      const result = onCreate({ ...draft, clientIds: [...draft.clientIds] });
      if ('then' in result) {
        if (mounted.current) setBusy(true);
        void result.then(
          (value) => finish(value.ok ? '' : value.error),
          () => finish(t('common.error')),
        );
      } else finish(result.ok ? '' : result.error);
    } catch {
      finish(t('common.error'));
    }
  };
  const times = [
    ...new Set([
      '07:00',
      '09:00',
      '11:30',
      '14:00',
      '17:00',
      '18:00',
      '18:30',
      '19:00',
      '20:00',
      ...(draft.start ? [draft.start] : []),
    ]),
  ].sort();
  const dateOptions = [...new Set([...dates, draft.date])].sort();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas">
      <View className="min-h-[58px] flex-row items-center px-2 pb-1 pt-[10px]">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('sessionEditor.close')}
          disabled={busy}
          accessibilityState={{ disabled: busy }}
          onPress={() => {
            if (!locked.current) onClose();
          }}
          className="h-touch w-touch items-center justify-center"
        >
          <Icon name="close" size={22} color={colors.ink} />
        </Pressable>
        <Text className="flex-1 text-center font-displayBold text-[17px] leading-[24.65px] tracking-[-0.2px]">
          {t('sessionEditor.title')}
        </Text>
        <View className="w-touch" />
      </View>
      <View className="px-[18px] pb-3 pt-[2px]">
        <Text
          accessibilityRole="header"
          className="font-heading text-[27px] leading-[28.35px] tracking-[-0.5px]"
        >
          {t('sessionEditor.heading')}
        </Text>
        <Text className="mt-[7px] max-w-[320px] font-medium text-[14px] leading-[20.3px] text-secondary">
          {t('sessionEditor.subtitle')}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2 px-4 pb-3 pt-1">
        {(['clients', 'date', 'time', 'program'] as const).map((key, index) => (
          <EditorChip
            key={key}
            label={`${index + 1}. ${t(`sessionEditor.${key}`)}`}
            selected={step === index}
            disabled={blocked || index >= step}
            onPress={() => {
              if (disabled || locked.current) return;
              setStep(index);
              setError('');
            }}
          />
        ))}
      </View>
      <ScrollView contentContainerClassName="px-4 pb-4">
        {storageError ? (
          <EditorNotice warning>{storageError}</EditorNotice>
        ) : null}
        {step === 0 && (
          <>
            <EditorLabel>{t('sessionEditor.who')}</EditorLabel>
            <Card flush className="p-[6px]">
              {clients.map((client, index) => (
                <ChoiceRow
                  key={client.id}
                  disabled={blocked}
                  title={client.name}
                  meta={client.meta ?? t('sessionEditor.noProgram')}
                  lead={client.initials}
                  selected={draft.clientIds.includes(client.id)}
                  last={index === clients.length - 1}
                  onPress={() =>
                    patch({
                      clientIds: draft.clientIds.includes(client.id)
                        ? draft.clientIds.filter((id) => id !== client.id)
                        : [...draft.clientIds, client.id],
                    })
                  }
                />
              ))}
            </Card>
            <View className="mt-3">
              <EditorNotice>{t('sessionEditor.groupHint')}</EditorNotice>
            </View>
          </>
        )}
        {step === 1 && (
          <>
            <EditorLabel>{t('sessionEditor.date')}</EditorLabel>
            <Card flush className="p-[6px]">
              {dateOptions.map((date, index) => (
                <ChoiceRow
                  key={date}
                  disabled={blocked}
                  title={
                    date === today
                      ? t('sessionEditor.today', { date: dateLabel(date) })
                      : dateLabel(date)
                  }
                  lead={String(Number(date.slice(8)))}
                  selected={draft.date === date}
                  last={index === dateOptions.length - 1}
                  onPress={() => patch({ date })}
                />
              ))}
            </Card>
          </>
        )}
        {step === 2 && (
          <>
            <EditorLabel>{t('sessionEditor.date')}</EditorLabel>
            <Card flush className="p-[6px]">
              <ChoiceRow
                disabled={blocked}
                title={
                  draft.date === today
                    ? t('sessionEditor.today', { date: dateLabel(draft.date) })
                    : dateLabel(draft.date)
                }
                meta={t('sessionEditor.changeDate')}
                lead={String(Number(draft.date.slice(8)))}
                selected
                last
                onPress={() => {
                  if (disabled || locked.current) return;
                  setStep(1);
                  setError('');
                }}
              />
            </Card>
            <View className="mt-4">
              <EditorLabel>{t('sessionEditor.start')}</EditorLabel>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {times.map((start) => (
                <EditorChip
                  key={start}
                  disabled={blocked}
                  label={start}
                  selected={draft.start === start}
                  onPress={() => patch({ start })}
                />
              ))}
            </View>
            <View className="mt-[18px]">
              <EditorLabel>{t('sessionEditor.duration')}</EditorLabel>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {[45, 60, 75, 90].map((duration) => (
                <EditorChip
                  key={duration}
                  disabled={blocked}
                  label={t('sessionEditor.minutes', { count: duration })}
                  selected={draft.duration === duration}
                  onPress={() => patch({ duration })}
                />
              ))}
            </View>
          </>
        )}
        {step === 3 && (
          <>
            {collisions.length > 0 && (
              <>
                <View className="mb-[14px]">
                  <EditorNotice warning>
                    {t('sessionEditor.collisions', {
                      count: collisions.length,
                      sessions: collisions
                        .map((item) => `${item.start} ${item.title}`)
                        .join(', '),
                    })}
                  </EditorNotice>
                </View>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={t('sessionEditor.acknowledge')}
                  disabled={blocked}
                  accessibilityState={{
                    checked: draft.collisionAck,
                    disabled: blocked,
                  }}
                  onPress={() => patch({ collisionAck: !draft.collisionAck })}
                  className="mb-[14px] min-h-touch flex-row items-center gap-[10px] rounded-[14px] bg-surface px-[14px] py-3"
                >
                  <View
                    className={`h-5 w-5 items-center justify-center rounded border border-ink ${draft.collisionAck ? 'bg-ink' : ''}`}
                  >
                    {draft.collisionAck && (
                      <Icon name="check" size={16} color={colors.canvas} />
                    )}
                  </View>
                  <Text className="flex-1 font-strong text-[14px] leading-[20.3px]">
                    {t('sessionEditor.acknowledge')}
                  </Text>
                </Pressable>
              </>
            )}
            <EditorLabel>{t('sessionEditor.program')}</EditorLabel>
            <Card flush className="p-[6px]">
              {templates.map((template, index) => (
                <ChoiceRow
                  key={template.program}
                  disabled={blocked}
                  title={template.name}
                  meta={template.meta}
                  icon="dumbbell"
                  selected={draft.program === template.program}
                  last={index === templates.length - 1}
                  onPress={() => patch({ program: template.program })}
                />
              ))}
            </Card>
            <Card flush className="mt-3 p-[6px]">
              <ChoiceRow
                disabled={blocked}
                title={t('sessionEditor.later')}
                meta={t('sessionEditor.laterHint')}
                icon="clock"
                selected={draft.programLater}
                last
                onPress={() => patch({ programLater: true })}
              />
            </Card>
          </>
        )}
        {error ? (
          <Text accessibilityRole="alert" className="mt-3 text-danger">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <View className="flex-row gap-[10px] px-4 pb-[26px] pt-3">
        {step > 0 && (
          <Button
            disabled={blocked}
            label={t('sessionEditor.back')}
            variant="soft"
            onPress={previous}
          />
        )}
        <Button
          className="flex-1"
          label={t(step < 3 ? 'sessionEditor.next' : 'sessionEditor.create')}
          variant={step < 3 ? 'primary' : 'mint'}
          disabled={
            blocked ||
            (step === 0 && draft.clientIds.length === 0) ||
            (step === 2 && !draft.start)
          }
          loading={busy}
          onPress={
            step < 3
              ? () => {
                  if (disabled || locked.current) return;
                  setStep((current) => current + 1);
                  setError('');
                }
              : save
          }
        />
      </View>
    </SafeAreaView>
  );
}

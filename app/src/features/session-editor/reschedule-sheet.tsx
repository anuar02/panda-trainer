import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Field } from '@/ui/field';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useEditorDate } from './date';
import type { RescheduleSheetProps } from './types';

function RescheduleForm({
  session,
  initialTarget,
  onSubmit,
  onClose,
  disabled,
}: RescheduleSheetProps) {
  const { t } = useTranslation();
  const dateLabel = useEditorDate();
  const [target, setTarget] = useState(
    initialTarget ?? { date: session.date, start: session.start },
  );
  const [error, setError] = useState('');
  const minutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const submit = () => {
    if (disabled) return;
    const result = onSubmit(target);
    if (result.ok) onClose();
    else setError(result.error);
  };
  return (
    <>
      <Text className="text-[14px] leading-[20.3px] text-secondary">
        {t('sessionEditor.sessionSummary', {
          name: session.clientName,
          count:
            session.durationMinutes ??
            minutes(session.end) - minutes(session.start),
        })}
      </Text>
      <View className="gap-1 rounded-[14px] bg-sunken p-[14px]">
        <Text className="font-bold">{t('sessionEditor.current')}</Text>
        <Text>
          {t('sessionEditor.currentTime', {
            date: dateLabel(session.date),
            start: session.start,
            end: session.end,
          })}
        </Text>
      </View>
      <Text className="text-[14px] leading-[21px] text-secondary">
        {t('sessionEditor.rescheduleHint')}
      </Text>
      <Field
        label={t('sessionEditor.newDate')}
        value={target.date}
        editable={!disabled}
        autoCapitalize="none"
        onChangeText={(date) => {
          setTarget((current) => ({ ...current, date }));
          setError('');
        }}
      />
      <Field
        label={t('sessionEditor.start')}
        value={target.start}
        editable={!disabled}
        autoCapitalize="none"
        onChangeText={(start) => {
          setTarget((current) => ({ ...current, start }));
          setError('');
        }}
      />
      {error ? (
        <Text accessibilityRole="alert" className="text-danger">
          {error}
        </Text>
      ) : null}
      <View className="mt-5">
        <Button
          label={t('sessionEditor.send')}
          disabled={disabled}
          onPress={submit}
        />
      </View>
    </>
  );
}

export function RescheduleSheet(props: RescheduleSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={props.open}
      title={t(
        props.counter ? 'sessionEditor.counter' : 'sessionEditor.reschedule',
      )}
      onClose={props.onClose}
    >
      {props.open && (
        <RescheduleForm
          key={`${props.session.id}:${props.counter}:${props.initialTarget?.date}:${props.initialTarget?.start}`}
          {...props}
        />
      )}
    </Sheet>
  );
}

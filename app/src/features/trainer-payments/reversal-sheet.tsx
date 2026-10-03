import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Field } from '../../ui/field';
import { Sheet } from '../../ui/sheet';
import { Text } from '../../ui/text';
import { formatPurchaseMoney } from '../../domain/purchases';
import type { PaymentEntry } from './types';

type Props = {
  payment: PaymentEntry;
  disabled: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<boolean>;
};
export function PaymentReversalSheet({
  payment,
  disabled,
  onClose,
  onConfirm,
}: Props) {
  const { t, i18n } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const confirm = async () => {
    if (
      !active.current ||
      disabled ||
      locked.current ||
      !reason.trim() ||
      reason.trim().length > 1000
    )
      return;
    locked.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const success = await onConfirm(reason.trim());
      if (active.current) {
        if (success) onClose();
        else setFailed(true);
      }
    } catch {
      if (active.current) setFailed(true);
    } finally {
      if (active.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <Sheet
      open
      title={t('trainerPayments.reverseTitle')}
      closeLabel={t('trainerPayments.cancel')}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Text className="text-secondary">
        {t('trainerPayments.reverseNotice', {
          amount: formatPurchaseMoney(payment.amountMinor, i18n.language),
        })}
      </Text>
      <Field
        label={t('trainerPayments.reverseReason')}
        value={reason}
        onChangeText={setReason}
        editable={!busy && !disabled}
        multiline
      />
      {failed && (
        <Text accessibilityRole="alert">
          {t('trainerPayments.reverseError')}
        </Text>
      )}
      <View className="mt-[18px] gap-[10px]">
        <Button
          label={t('trainerPayments.reverseConfirm')}
          variant="soft"
          loading={busy}
          disabled={
            disabled || busy || !reason.trim() || reason.trim().length > 1000
          }
          onPress={() => void confirm()}
        />
        <Button
          label={t('trainerPayments.cancel')}
          variant="ghost"
          disabled={busy}
          onPress={onClose}
        />
      </View>
    </Sheet>
  );
}

import { useLayoutEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../../ui/sheet';
import { Button } from '../../ui/button';
import { Text } from '../../ui/text';
import { useTheme } from '../../ui/theme';
import { Icon } from '../../ui/icons';
import { useFinancialFormLifecycle } from '../trainer-billing/use-form-lifecycle';
import { date, minorMoney } from '../trainer-billing/validation';
import { formatPurchaseMoney } from '../../domain/purchases';
import type { PaymentEntry } from './types';

export type PaymentSheetInput = {
  amountMinor: string;
  paidOn: string;
  method: PaymentEntry['method'];
};
type Props = {
  open: boolean;
  clientName: string;
  purchaseTitle: string;
  purchaseId?: string;
  dueMinor: string;
  today: string;
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
  isCurrent?: () => boolean;
  onClose: () => void;
  onSubmit: (input: PaymentSheetInput) => Promise<boolean>;
};
export function parsePaymentAmount(value: string): string | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,17}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = '0', fraction = ''] = normalized.split('.');
  const minor = (
    BigInt(whole) * BigInt(100) +
    BigInt(fraction.padEnd(2, '0'))
  ).toString();
  return minor !== '0' && minorMoney(minor) ? minor : null;
}
const initialAmount = (minor: string) => {
  if (!minorMoney(minor) || minor === '0') return '';
  const value = BigInt(minor);
  const fraction = value % BigInt(100);
  return `${value / BigInt(100)}${fraction === BigInt(0) ? '' : `.${fraction.toString().padStart(2, '0')}`}`;
};
export function PaymentSheet(props: Props) {
  const { t } = useTranslation();
  const lifecycle = useFinancialFormLifecycle(
    props.isCurrent,
    props.purchaseId,
  );
  const close = () => lifecycle.close(props.onClose);
  return (
    <Sheet
      open={props.open}
      title={t('trainerPayments.title')}
      onClose={close}
      closeLabel={t('trainerPayments.cancel')}
    >
      {props.open && (
        <PaymentForm
          key={JSON.stringify([props.purchaseId, lifecycle.version])}
          {...props}
          isCurrent={lifecycle.isCurrent}
          onClose={close}
        />
      )}
    </Sheet>
  );
}
function PaymentForm({
  clientName,
  dueMinor,
  today,
  busy = false,
  disabled = false,
  error,
  isCurrent = () => true,
  onClose,
  onSubmit,
}: Props) {
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const [amount, setAmount] = useState(() => initialAmount(dueMinor));
  const [paidOn] = useState(today);
  const [method, setMethod] = useState<PaymentEntry['method']>('Kaspi');
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(true);
  const locked = useRef(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const amountMinor = parsePaymentAmount(amount);
  const dueValid = minorMoney(dueMinor);
  const overDebt =
    amountMinor !== null && dueValid && BigInt(amountMinor) > BigInt(dueMinor);
  const paidOnValid = date(paidOn);
  const blocked =
    busy ||
    disabled ||
    submitting ||
    !dueValid ||
    !paidOnValid ||
    dueMinor === '0';
  const submit = async () => {
    if (!active.current || !isCurrent() || blocked || locked.current) return;
    setAttempted(true);
    if (amountMinor === null || overDebt || !paidOnValid) return;
    locked.current = true;
    setSubmitting(true);
    setFailed(false);
    try {
      const saved = await onSubmit({
        amountMinor,
        paidOn: paidOn.trim(),
        method,
      });
      if (active.current && isCurrent()) {
        if (saved) onClose();
        else setFailed(true);
      }
    } catch {
      if (active.current && isCurrent()) setFailed(true);
    } finally {
      locked.current = false;
      if (active.current && isCurrent()) setSubmitting(false);
    }
  };
  return (
    <>
      <Text className="text-secondary">
        {t('trainerPayments.subtitle', {
          name: clientName,
          amount: dueValid ? formatPurchaseMoney(dueMinor, i18n.language) : '—',
        })}
      </Text>
      <View style={{ gap: 10 }}>
        <Text
          style={{
            color: colors.secondary,
            fontFamily: 'Inter_700Bold',
            fontSize: 14,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}
        >
          {t('trainerPayments.amount')}
        </Text>
        <TextInput
          accessibilityLabel={t('trainerPayments.amount')}
          placeholder={t('trainerPayments.amountPlaceholder')}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          editable={!blocked}
          placeholderTextColor={colors.secondary}
          selectionColor={colors.accent}
          style={{
            backgroundColor: colors.sunken,
            borderRadius: 14,
            height: 64,
            paddingHorizontal: 18,
            fontFamily: 'Montserrat_800ExtraBold',
            fontSize: 24,
            letterSpacing: -0.3,
            color: colors.ink,
          }}
        />
        {error || (attempted && (amountMinor === null || overDebt)) ? (
          <Text accessibilityRole="alert" className="text-danger">
            {error ||
              (amountMinor === null
                ? t('trainerPayments.invalidAmount')
                : t('trainerPayments.overDebt', {
                    amount: formatPurchaseMoney(dueMinor, i18n.language),
                  }))}
          </Text>
        ) : null}
      </View>
      <View style={{ gap: 10 }}>
        <Text
          style={{
            color: colors.secondary,
            fontFamily: 'Inter_700Bold',
            fontSize: 14,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}
        >
          {t('trainerPayments.method')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['Kaspi', 'Перевод', 'Наличные'] as const).map((value, index) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{
                selected: method === value,
                disabled: blocked,
              }}
              disabled={blocked}
              onPress={() => setMethod(value)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                minHeight: 44,
                borderRadius: 99,
                backgroundColor:
                  method === value
                    ? scheme === 'dark'
                      ? 'rgba(111, 134, 255, 0.16)'
                      : 'rgba(43, 72, 214, 0.09)'
                    : colors.sunken,
                borderWidth: 1,
                borderColor: method === value ? colors.accent : 'transparent',
              }}
            >
              <Text
                style={{
                  color: method === value ? colors.ink : colors.secondary,
                  fontFamily: 'Inter_600SemiBold',
                  fontSize: 14,
                }}
              >
                {t(
                  index === 0
                    ? 'trainerPayments.methodKaspi'
                    : index === 1
                      ? 'trainerPayments.methodTransfer'
                      : 'trainerPayments.methodCash',
                )}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {failed && !error ? (
        <Text accessibilityRole="alert" className="text-danger">
          {t('trainerPayments.submitError')}
        </Text>
      ) : null}
      {!paidOnValid ? (
        <Text accessibilityRole="alert" className="text-danger">
          {t('trainerPayments.invalidDate')}
        </Text>
      ) : null}
      <View style={{ gap: 10 }}>
        <Button
          label={t('trainerPayments.save')}
          variant="mint"
          icon={<Icon name="check" size={20} color={colors.canvas} />}
          loading={busy || submitting}
          disabled={disabled || !dueValid || !paidOnValid || dueMinor === '0'}
          onPress={() => void submit()}
        />
        <Button
          label={t('trainerPayments.cancel')}
          variant="ghost"
          onPress={onClose}
        />
      </View>
    </>
  );
}

import { useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../../ui/sheet';
import { Field } from '../../ui/field';
import { Button } from '../../ui/button';
import { Text } from '../../ui/text';
import type { CreateClientPurchaseInput } from './types';
import { useFinancialFormLifecycle } from './use-form-lifecycle';
import { date, minorMoney, positiveInteger } from './validation';
export type PurchaseCreateInput = Pick<
  CreateClientPurchaseInput,
  'title' | 'units' | 'priceMinor' | 'expiresOn'
>;
type Props = {
  open: boolean;
  clientName: string;
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
  isCurrent?: () => boolean;
  onClose: () => void;
  onSubmit: (input: PurchaseCreateInput) => Promise<boolean>;
};
export function parsePurchasePrice(value: string): string | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,17}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = '0', fraction = ''] = normalized.split('.');
  const minor = (
    BigInt(whole) * BigInt(100) +
    BigInt(fraction.padEnd(2, '0'))
  ).toString();
  return minor !== '0' && minorMoney(minor) ? minor : null;
}
export function PurchaseCreateSheet(props: Props) {
  const { t } = useTranslation();
  const lifecycle = useFinancialFormLifecycle(props.isCurrent);
  const close = () => lifecycle.close(props.onClose);
  return (
    <Sheet
      open={props.open}
      title={t('trainerBillingPurchase.title')}
      onClose={close}
      closeLabel={t('trainerPayments.cancel')}
    >
      {props.open && (
        <PurchaseCreateForm
          key={lifecycle.version}
          {...props}
          isCurrent={lifecycle.isCurrent}
          onClose={close}
        />
      )}
    </Sheet>
  );
}
function PurchaseCreateForm({
  clientName,
  busy = false,
  disabled = false,
  error,
  isCurrent = () => true,
  onClose,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [units, setUnits] = useState('');
  const [price, setPrice] = useState('');
  const [expiry, setExpiry] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  const active = useRef(true);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const titleValid = title.trim().length > 0 && title.trim().length <= 200;
  const unitsValue = /^\d{1,10}$/.test(units.trim()) ? Number(units) : 0;
  const unitsValid = positiveInteger(unitsValue);
  const priceMinor = parsePurchasePrice(price);
  const expiresOn = expiry.trim() || null;
  const expiryValid = expiresOn === null || date(expiresOn);
  const blocked = busy || disabled || submitting;
  const submit = async () => {
    if (!active.current || !isCurrent() || blocked || locked.current) return;
    setAttempted(true);
    if (!titleValid || !unitsValid || priceMinor === null || !expiryValid)
      return;
    locked.current = true;
    setSubmitting(true);
    setFailed(false);
    try {
      const saved = await onSubmit({
        title: title.trim(),
        units: unitsValue,
        priceMinor,
        expiresOn,
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
      <Text className="text-secondary">{clientName}</Text>
      <View className="gap-[18px]">
        <Field
          label={t('trainerBillingPurchase.name')}
          placeholder={t('trainerBillingPurchase.namePlaceholder')}
          value={title}
          onChangeText={setTitle}
          editable={!blocked}
          error={
            attempted && !titleValid
              ? t('trainerBillingPurchase.invalidTitle')
              : undefined
          }
        />
        <Field
          label={t('trainerBillingPurchase.units')}
          value={units}
          onChangeText={setUnits}
          keyboardType="number-pad"
          editable={!blocked}
          error={
            attempted && !unitsValid
              ? t('trainerBillingPurchase.invalidUnits')
              : undefined
          }
        />
        <Field
          label={t('trainerBillingPurchase.price')}
          placeholder={t('trainerBillingPurchase.pricePlaceholder')}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          editable={!blocked}
          style={{ fontFamily: 'Montserrat_800ExtraBold', fontSize: 24 }}
          error={
            attempted && priceMinor === null
              ? t('trainerBillingPurchase.invalidPrice')
              : undefined
          }
        />
        <Field
          label={t('trainerBillingPurchase.expiry')}
          placeholder={t('trainerBillingPurchase.expiryPlaceholder')}
          value={expiry}
          onChangeText={setExpiry}
          autoCapitalize="none"
          editable={!blocked}
          error={
            attempted && !expiryValid
              ? t('trainerBillingPurchase.invalidExpiry')
              : undefined
          }
        />
        <Text className="text-secondary">
          {t('trainerBillingPurchase.expiryHint')}
        </Text>
      </View>
      {error || failed ? (
        <Text accessibilityRole="alert" className="text-danger">
          {error || t('trainerBillingPurchase.submitError')}
        </Text>
      ) : null}
      <Button
        variant="mint"
        label={t('trainerBillingPurchase.save')}
        loading={busy || submitting}
        disabled={disabled}
        onPress={() => void submit()}
      />
    </>
  );
}

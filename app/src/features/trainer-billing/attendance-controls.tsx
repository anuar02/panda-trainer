import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Field } from '@/ui/field';
import { Sheet } from '@/ui/sheet';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { Icon } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import type { BillingAttendance } from './types';
import type { TrainerBillingCommand } from './commands';

export type AttendanceBooking = {
  id: string;
  client_record_id: string;
  client_name: string;
  status: string;
  revision: number;
  starts_at: string;
};
export type AttendancePurchase = {
  id: string;
  title: string;
  remaining: number;
  expiresOn?: string | null;
};
export type AttendanceControlsProps = {
  booking: AttendanceBooking;
  attendance: BillingAttendance | null;
  charged: boolean;
  eligiblePurchases: readonly AttendancePurchase[];
  disabled?: boolean;
  busy?: boolean;
  onCommand: (command: TrainerBillingCommand) => Promise<boolean>;
  onChanged?: () => void;
  showHeading?: boolean;
  showHelp?: boolean;
};

export function AttendanceControls(props: AttendanceControlsProps) {
  const { booking, attendance } = props;
  const identity = [
    booking.id,
    booking.starts_at,
    booking.revision,
    attendance?.id,
    attendance?.revision,
    attendance?.cycle,
  ].join(':');
  return <AttendanceControlsContent key={identity} {...props} />;
}

function AttendanceControlsContent({
  booking,
  attendance,
  charged,
  eligiblePurchases,
  disabled = false,
  busy = false,
  onCommand,
  onChanged,
  showHeading = true,
  showHelp = true,
}: AttendanceControlsProps) {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const [sheet, setSheet] = useState<
    'mark' | 'bind' | 'correct' | 'penalty' | null
  >(null);
  const [reason, setReason] = useState('');
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const epoch = useRef(0);
  useEffect(
    () => () => {
      epoch.current += 1;
    },
    [],
  );
  const blocked = disabled || busy || submitting;
  const cancelled =
    booking.status === 'cancelled_by_client' ||
    booking.status === 'cancelled_by_trainer';
  const active =
    booking.status === 'confirmed' || booking.status === 'proposed';
  const current = attendance?.status === 'undone' ? null : attendance;
  const selected =
    eligiblePurchases.find((purchase) => purchase.id === purchaseId) ??
    eligiblePurchases[0];
  const open = (value: typeof sheet) => {
    if (blocked) return;
    setReason('');
    setPurchaseId(null);
    setSheet(value);
  };
  const submit = async (command: TrainerBillingCommand) => {
    if (blocked || lock.current) return;
    lock.current = true;
    setSubmitting(true);
    const version = epoch.current;
    try {
      const success = await onCommand(command);
      if (version === epoch.current && success) {
        setSheet(null);
        setReason('');
        onChanged?.();
      }
    } finally {
      if (version === epoch.current) {
        lock.current = false;
        setSubmitting(false);
      }
    }
  };
  const bookingCommand = () => ({
    bookingId: booking.id,
    expectedBookingRevision: booking.revision,
    requestId: randomUUID(),
  });
  const confirm = (charge = false) => {
    if (blocked) return;
    if (sheet === 'mark' && active && !current && (!charge || selected)) {
      void submit({
        action: 'markAttended',
        ...bookingCommand(),
        charge,
        ...(charge ? { purchaseId: selected?.id } : {}),
      });
    } else if (
      sheet === 'bind' &&
      current?.status === 'present' &&
      !charged &&
      selected
    ) {
      void submit({
        action: 'bindPurchase',
        requestId: randomUUID(),
        expectedBookingRevision: booking.revision,
        attendanceId: current.id,
        expectedAttendanceRevision: current.revision,
        purchaseId: selected.id,
      });
    } else if (sheet === 'correct' && current && reason.trim()) {
      void submit({
        action: 'undoAttendance',
        requestId: randomUUID(),
        expectedBookingRevision: booking.revision,
        attendanceId: current.id,
        expectedAttendanceRevision: current.revision,
        reason: reason.trim(),
      });
    } else if (
      sheet === 'penalty' &&
      !charged &&
      selected &&
      reason.trim() &&
      (cancelled || current?.status === 'noshow')
    ) {
      void submit({
        action: 'chargeLateCancellation',
        ...bookingCommand(),
        purchaseId: selected.id,
        reason: reason.trim(),
      });
    }
  };
  const picks = sheet !== 'correct' && sheet !== null && (
    <View className="gap-2">
      {eligiblePurchases.length > 1 && (
        <Text className="text-secondary">
          {t('trainerBilling.selectPurchase')}
        </Text>
      )}
      {eligiblePurchases.length > 1 &&
        eligiblePurchases.map((purchase) => (
          <Button
            key={purchase.id}
            compact
            variant={selected?.id === purchase.id ? 'secondary' : 'ghost'}
            accessibilityState={{
              selected: selected?.id === purchase.id,
              disabled: blocked,
            }}
            label={t('trainerBilling.purchaseOption', {
              title: purchase.title,
              remaining: purchase.remaining,
            })}
            disabled={blocked}
            onPress={() => setPurchaseId(purchase.id)}
          />
        ))}
      {!selected && (
        <Text className="text-secondary">{t('trainerBilling.noPurchase')}</Text>
      )}
    </View>
  );
  const needsReason = sheet === 'correct' || sheet === 'penalty';
  return (
    <View>
      {showHeading && (
        <Text className="font-semibold text-[12px] uppercase tracking-[0.6px] text-secondary">
          {t('trainerBilling.attendanceLabel')}
        </Text>
      )}
      <View
        className="gap-[10px] py-4 border-t"
        style={{ borderTopColor: scheme === 'dark' ? '#212227' : '#efefeb' }}
      >
        <View className="flex-row gap-[10px] items-center">
          <View className="h-10 w-10 rounded-full bg-sunken items-center justify-center">
            <Text className="font-bold">
              {booking.client_name
                .split(/\s+/)
                .map((part) => part[0])
                .slice(0, 2)
                .join('')}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-[14.5px]">
              {booking.client_name}
            </Text>
            <Text className="text-secondary text-[14px] mt-px">
              {t(
                `trainerBilling.${current?.status === 'present' ? 'present' : current?.status === 'noshow' ? 'noshow' : cancelled && charged ? 'cancelled' : 'unmarked'}`,
              )}
            </Text>
          </View>
        </View>
        {current ? (
          <StatusPill
            tone={current.status === 'present' ? 'success' : 'danger'}
            label={t(
              `trainerBilling.${current.status === 'present' ? (charged ? 'charged' : 'uncharged') : charged ? 'penaltyCharged' : 'noshow'}`,
            )}
          />
        ) : cancelled && charged ? (
          <StatusPill
            tone="danger"
            label={t('trainerBilling.cancelledCharged')}
          />
        ) : (
          active && (
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                compact
                variant="soft"
                label={t('trainerBilling.arrived')}
                disabled={blocked}
                onPress={() => open('mark')}
              />
              <Button
                className="flex-1"
                compact
                variant="ghost"
                label={t('trainerBilling.absent')}
                disabled={blocked}
                onPress={() =>
                  void submit({ action: 'markNoShow', ...bookingCommand() })
                }
              />
            </View>
          )
        )}
        {current?.status === 'present' && !charged && active && (
          <Button
            compact
            variant="soft"
            label={t('trainerBilling.bind')}
            disabled={blocked || !selected}
            onPress={() => open('bind')}
          />
        )}
        {current && (
          <Button
            compact
            variant="ghost"
            label={t('trainerBilling.correct')}
            disabled={blocked}
            onPress={() => open('correct')}
          />
        )}
        {!charged && (cancelled || current?.status === 'noshow') && (
          <Button
            compact
            variant="ghost"
            label={t('trainerBilling.penalty')}
            disabled={blocked || !selected}
            onPress={() => open('penalty')}
          />
        )}
      </View>
      {showHelp && (
        <Text className="text-[14px] leading-[21px] text-secondary">
          {t('trainerBilling.cancellationHelp')}
        </Text>
      )}
      <Sheet
        open={sheet !== null}
        stackBehavior="push"
        title={t(
          `trainerBilling.${sheet === 'mark' ? 'chargeTitle' : sheet === 'bind' ? 'bindTitle' : sheet === 'correct' ? 'correctionTitle' : 'penaltyTitle'}`,
        )}
        onClose={() => {
          if (!blocked) setSheet(null);
        }}
      >
        {sheet === 'mark' && (
          <Text className="text-secondary">
            {t('trainerBilling.chargeSubtitle', { name: booking.client_name })}
          </Text>
        )}
        <View
          className="rounded-[18px] px-[15px] py-[13px] mt-4 flex-row items-start gap-[11px]"
          style={{
            backgroundColor:
              scheme === 'dark'
                ? 'rgba(61,220,151,0.13)'
                : 'rgba(22,163,74,0.12)',
          }}
        >
          {(sheet === 'mark' || sheet === 'bind') && (
            <Icon
              name="check"
              size={18}
              color={scheme === 'dark' ? '#3ddc97' : '#15803d'}
            />
          )}
          <Text
            className="flex-1 text-[14px] leading-[21px] font-medium"
            style={{ color: scheme === 'dark' ? '#3ddc97' : '#15803d' }}
          >
            {t(
              `trainerBilling.${sheet === 'mark' || sheet === 'bind' ? 'chargeNotice' : sheet === 'correct' ? (charged ? 'correctionNotice' : 'correctionWithoutCharge') : 'penaltyNotice'}`,
            )}
          </Text>
        </View>
        {picks}
        {needsReason && (
          <Field
            label={t('trainerBilling.reason')}
            placeholder={t('trainerBilling.reasonRequired')}
            value={reason}
            onChangeText={setReason}
            editable={!blocked}
            multiline
          />
        )}
        <View className="mt-[18px] gap-[10px]">
          {sheet === 'mark' ? (
            <>
              <Button
                variant="mint"
                label={t('trainerBilling.markAndCharge')}
                disabled={blocked || !selected}
                icon={<Icon name="check" size={20} color="#ffffff" />}
                onPress={() => confirm(true)}
              />
              <Button
                variant="soft"
                label={t('trainerBilling.markOnly')}
                disabled={blocked}
                onPress={() => confirm(false)}
              />
            </>
          ) : (
            <Button
              variant={sheet === 'correct' ? 'soft' : 'mint'}
              label={t(
                `trainerBilling.${sheet === 'correct' ? 'correctionConfirm' : 'penaltyConfirm'}`,
              )}
              disabled={
                blocked ||
                (needsReason && !reason.trim()) ||
                (sheet !== 'correct' && !selected)
              }
              onPress={() => confirm()}
            />
          )}
        </View>
      </Sheet>
    </View>
  );
}

import { useTranslation } from 'react-i18next';
import { eligiblePurchases, projectBookingAttendance } from '@/domain/billing';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import { AttendanceControls } from '../trainer-billing/attendance-controls';
import type { TrainerBillingCommand } from '../trainer-billing/commands';
import type { TrainerBilling } from '../trainer-billing/types';
import type { WorkspaceScheduleBooking } from './service';
import { workspaceDateKey } from './clock';

export function WorkspaceAttendanceControls({
  booking,
  data,
  workspaceId,
  timezone,
  disabled,
  busy,
  showHeading,
  showHelp,
  onCommand,
  onRetry,
}: {
  booking: WorkspaceScheduleBooking;
  data: TrainerBilling;
  workspaceId: string;
  timezone: string;
  disabled: boolean;
  busy: boolean;
  showHeading: boolean;
  showHelp: boolean;
  onCommand: (command: TrainerBillingCommand) => Promise<boolean>;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const scope = { workspaceId, clientRecordId: booking.client_record_id };
  const projection = projectBookingAttendance(data, scope, booking.id);
  if (!projection.valid)
    return (
      <>
        <Text className="font-strong">{booking.client_name}</Text>
        <Text accessibilityRole="alert">{t('trainerBilling.readError')}</Text>
        <Button label={t('common.retry')} onPress={onRetry} />
      </>
    );
  const serviceDate =
    projection.attendance && projection.attendance.status !== 'undone'
      ? projection.attendance.serviceDate
      : workspaceDateKey(new Date(booking.starts_at), timezone);
  const purchases = eligiblePurchases(data, scope, serviceDate).map(
    (value) => ({
      id: value.purchase.id,
      title: value.purchase.title,
      remaining: value.remainingUnits,
      expiresOn: value.purchase.expiresOn,
    }),
  );
  return (
    <AttendanceControls
      booking={booking}
      attendance={projection.attendance}
      charged={projection.charged}
      eligiblePurchases={purchases}
      disabled={disabled}
      busy={busy}
      showHeading={showHeading}
      showHelp={showHelp}
      onCommand={onCommand}
    />
  );
}

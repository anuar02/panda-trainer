import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { TrainerScheduleScreen } from '../trainer-schedule/trainer-schedule-screen';
import { workspaceAgendaSessions } from './agenda';
import { calendarWeekDateKeys, workspaceDateKey } from './clock';
import {
  workspaceScheduleRows,
  workspaceScheduleWindows,
} from './screen-adapter';
import {
  loadPendingWorkspaceBookingStatus,
  type PendingWorkspaceBookingStatus,
} from './status-pending';
import {
  resolvePendingWorkspaceBookingStatus,
  submitWorkspaceBookingStatus,
} from './status-submission';
import { WorkspaceBookingStatusError } from './status-operation';
import { useWorkspaceSchedule } from './use-schedule';
import { useTrainerBilling } from '../trainer-billing/use-billing';
import { useTrainerBillingCommands } from '../trainer-billing/use-commands';
import type { TrainerBillingCommand } from '../trainer-billing/commands';
import { WorkspaceAttendanceControls } from './workspace-attendance-controls';
import {
  WorkspaceProposalProvider,
  WorkspaceProposalRecovery,
  WorkspaceProposalControls,
} from './workspace-proposal-controls';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';

type WorkspaceScheduleScreenProps = {
  userId: string;
  workspaceId: string;
  timezone: string;
  initialDate?: string;
  initialSelectedId?: string;
};

export function WorkspaceScheduleScreen(props: WorkspaceScheduleScreenProps) {
  return (
    <WorkspaceScheduleContent
      key={`${props.userId}:${props.workspaceId}:${props.timezone}:${props.initialDate ?? ''}`}
      {...props}
    />
  );
}

function WorkspaceScheduleContent({
  userId,
  workspaceId,
  timezone,
  initialDate,
  initialSelectedId,
}: WorkspaceScheduleScreenProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const today = workspaceDateKey(new Date(), timezone);
  const [date, setDate] = useState(() => {
    if (!initialDate) return today;
    try {
      calendarWeekDateKeys(initialDate);
      return initialDate;
    } catch {
      return today;
    }
  });
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? null,
  );
  const [pending, setPending] = useState<PendingWorkspaceBookingStatus | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  const locked = useRef(false);
  const read = useWorkspaceSchedule(userId, workspaceId, date);
  const billing = useTrainerBilling(userId, workspaceId);
  const attendanceLocked = useRef(false);
  const attendanceCommands = useTrainerBillingCommands({
    userId,
    workspaceId,
    onChanged: () => {
      read.retry();
      billing.retry();
    },
  });
  const sendAttendance = async (command: TrainerBillingCommand) => {
    if (locked.current || attendanceLocked.current) return false;
    attendanceLocked.current = true;
    try {
      return await attendanceCommands.submit(command);
    } finally {
      attendanceLocked.current = false;
    }
  };

  useEffect(() => {
    let active = true;
    mounted.current = true;
    void loadPendingWorkspaceBookingStatus(userId, workspaceId).then(
      (command) => {
        if (!active) return;
        setPending(command);
        setStorageFailed(false);
        setError(null);
        setReady(true);
      },
      () => {
        if (!active) return;
        setStorageFailed(true);
        setReady(true);
      },
    );
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [attempt, userId, workspaceId]);

  const submit = async (
    command: PendingWorkspaceBookingStatus,
    resolving = false,
  ) => {
    if (
      locked.current ||
      attendanceLocked.current ||
      attendanceCommands.busy ||
      !ready ||
      storageFailed
    )
      return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      if (resolving)
        await resolvePendingWorkspaceBookingStatus(userId, workspaceId);
      else await submitWorkspaceBookingStatus(userId, workspaceId, command);
      if (!mounted.current) return;
      setSelectedId(null);
      read.retry();
    } catch (caught) {
      if (mounted.current)
        setError(
          t(
            caught instanceof WorkspaceBookingStatusError &&
              (caught.code === 'conflict' || caught.code === 'invalidState')
              ? `workspaceScheduling.${caught.code}`
              : 'workspaceScheduling.requestError',
          ),
        );
    } finally {
      try {
        const command = await loadPendingWorkspaceBookingStatus(
          userId,
          workspaceId,
        );
        if (mounted.current) setPending(command);
      } catch {
        if (mounted.current) setStorageFailed(true);
      }
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const schedule = read.schedule;
  const rows = schedule
    ? workspaceScheduleRows(schedule, t('trainerToday.miniGroup'))
    : [];
  const selected = schedule
    ? workspaceAgendaSessions(schedule).find(
        (session) => session.id === selectedId,
      )
    : null;
  const selectedDateLabel = selected
    ? new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${selected.date}T12:00:00Z`))
    : '';
  const blocked =
    !ready ||
    storageFailed ||
    busy ||
    pending !== null ||
    read.loading ||
    attendanceCommands.blocked;

  return (
    <WorkspaceProposalProvider
      userId={userId}
      workspaceId={workspaceId}
      onChanged={read.retry}
      externalBlocked={blocked}
      externalBusy={busy || attendanceCommands.busy}
    >
      {(proposal) => (
        <View className="flex-1 bg-canvas">
          <WorkspaceProposalRecovery />
          {attendanceCommands.pending ||
          attendanceCommands.error ||
          attendanceCommands.busy ? (
            <Card>
              <Text accessibilityRole="alert">
                {t(
                  `trainerBilling.${
                    attendanceCommands.error === 'storage'
                      ? 'storageError'
                      : attendanceCommands.error === 'invalidPending'
                        ? 'invalidPending'
                        : attendanceCommands.error === 'conflict'
                          ? 'conflict'
                          : attendanceCommands.error === 'invalidState'
                            ? 'invalidState'
                            : attendanceCommands.error
                              ? 'requestError'
                              : attendanceCommands.busy
                                ? 'busy'
                                : 'pending'
                  }`,
                )}
              </Text>
              <Button
                label={t(
                  attendanceCommands.pending &&
                    attendanceCommands.error !== 'storage' &&
                    attendanceCommands.error !== 'invalidPending'
                    ? 'trainerBilling.resume'
                    : 'common.retry',
                )}
                loading={attendanceCommands.busy}
                disabled={busy || proposal.busy}
                onPress={() => {
                  if (busy || proposal.busy || attendanceLocked.current) return;
                  if (
                    attendanceCommands.pending &&
                    attendanceCommands.error !== 'storage' &&
                    attendanceCommands.error !== 'invalidPending'
                  ) {
                    attendanceLocked.current = true;
                    void attendanceCommands.resume().finally(() => {
                      attendanceLocked.current = false;
                    });
                  } else {
                    attendanceCommands.reload();
                    billing.retry();
                    read.retry();
                  }
                }}
              />
            </Card>
          ) : null}
          {storageFailed || pending || error ? (
            <Card>
              <Text accessibilityRole="alert">
                {storageFailed
                  ? t('workspaceScheduling.pendingReadError')
                  : (error ?? t('workspaceScheduling.pending'))}
              </Text>
              {storageFailed ? (
                <Button
                  label={t('common.retry')}
                  disabled={busy}
                  onPress={() => {
                    setReady(false);
                    setAttempt((value) => value + 1);
                  }}
                />
              ) : pending ? (
                <Button
                  label={t('workspaceScheduling.resume')}
                  loading={busy}
                  disabled={proposal.busy}
                  onPress={() => {
                    if (!proposal.busy) void submit(pending);
                  }}
                />
              ) : null}
              {pending && !storageFailed ? (
                <Button
                  label={t('workspaceScheduling.resolvePending')}
                  loading={busy}
                  disabled={proposal.busy}
                  onPress={() => {
                    if (!proposal.busy) void submit(pending, true);
                  }}
                />
              ) : null}
            </Card>
          ) : null}
          {read.failed ? (
            <Screen title={t('common.error')}>
              <Button label={t('common.retry')} onPress={read.retry} />
            </Screen>
          ) : (
            <TrainerScheduleScreen
              scenario={read.loading ? 'loading' : 'normal'}
              data={{
                sessions: rows,
                date,
                today,
                timezone,
                timezoneLabel: timezone,
                freeWindows: schedule
                  ? workspaceScheduleWindows(schedule, date)
                  : [],
                createDisabled:
                  blocked ||
                  proposal.loading ||
                  proposal.busy ||
                  proposal.pending !== null ||
                  !schedule,
                onDateChange: (next) => {
                  setDate(next);
                  setSelectedId(null);
                },
                onCreate: (selectedDate, start) =>
                  router.push({
                    pathname: '/workspace/new',
                    params: { date: selectedDate, ...(start ? { start } : {}) },
                  }),
                onSelect: (session) => setSelectedId(session.id),
              }}
            />
          )}
          <Sheet
            open={Boolean(selected)}
            title={rows.find((row) => row.id === selectedId)?.title ?? ''}
            onClose={() => setSelectedId(null)}
          >
            {selected ? (
              <Text className="text-secondary">
                {t('trainerToday.sessionTime', {
                  date:
                    selectedDateLabel.charAt(0).toUpperCase() +
                    selectedDateLabel.slice(1),
                  time: `${rows.find((row) => row.id === selectedId)?.start ?? ''}–${rows.find((row) => row.id === selectedId)?.end ?? ''}`,
                })}
              </Text>
            ) : null}
            {billing.error ? (
              <Card>
                <Text accessibilityRole="alert">
                  {t('trainerBilling.readError')}
                </Text>
                <Button label={t('common.retry')} onPress={billing.retry} />
              </Card>
            ) : billing.loading ? (
              <Text>{t('common.loading')}</Text>
            ) : null}
            {selected?.bookings.map((booking, index) => (
              <View key={booking.id} className="gap-2">
                {billing.data ? (
                  <WorkspaceAttendanceControls
                    booking={booking}
                    data={billing.data}
                    workspaceId={workspaceId}
                    timezone={timezone}
                    disabled={
                      blocked ||
                      proposal.loading ||
                      proposal.busy ||
                      proposal.pending !== null ||
                      proposal.error === 'storage' ||
                      proposal.error === 'invalidPending'
                    }
                    busy={attendanceCommands.busy}
                    showHeading={index === 0}
                    showHelp={index === selected.bookings.length - 1}
                    onCommand={sendAttendance}
                    onRetry={billing.retry}
                  />
                ) : (
                  <Text className="font-strong">{booking.client_name}</Text>
                )}
                <Text className="text-secondary">
                  {t(
                    booking.status === 'confirmed'
                      ? 'trainerSchedule.confirmed'
                      : booking.status === 'proposed'
                        ? 'schedulingDemo.pending'
                        : 'workspaceScheduling.cancelled',
                  )}
                </Text>
                {booking.status === 'proposed' ||
                booking.status === 'confirmed' ? (
                  <Button
                    label={t('workspaceScheduling.cancelParticipant', {
                      name: booking.client_name,
                    })}
                    variant="ghost"
                    disabled={
                      blocked ||
                      proposal.loading ||
                      proposal.busy ||
                      proposal.pending !== null ||
                      proposal.error === 'storage' ||
                      proposal.error === 'invalidPending'
                    }
                    onPress={() =>
                      void submit({
                        action: 'cancel',
                        bookingId: booking.id,
                        expectedRevision: booking.revision,
                        requestId: randomUUID(),
                      })
                    }
                  />
                ) : null}
                <WorkspaceProposalControls
                  store={proposal}
                  userId={userId}
                  workspaceId={workspaceId}
                  timezone={timezone}
                  booking={booking}
                  proposals={schedule?.pendingProposals ?? []}
                />
              </View>
            ))}
          </Sheet>
        </View>
      )}
    </WorkspaceProposalProvider>
  );
}

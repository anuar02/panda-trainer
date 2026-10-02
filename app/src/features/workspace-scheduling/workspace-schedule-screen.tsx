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
  const { t } = useTranslation();
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
    if (locked.current || !ready || storageFailed) return;
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
  const blocked =
    !ready || storageFailed || busy || pending !== null || read.loading;

  return (
    <WorkspaceProposalProvider
      userId={userId}
      workspaceId={workspaceId}
      onChanged={read.retry}
      externalBlocked={blocked}
      externalBusy={busy}
    >
      {(proposal) => (
        <View className="flex-1 bg-canvas">
          <WorkspaceProposalRecovery />
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
                createDisabled: read.loading || !schedule,
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
            {selected?.bookings.map((booking) => (
              <View key={booking.id} className="gap-2">
                <Text className="font-strong">{booking.client_name}</Text>
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

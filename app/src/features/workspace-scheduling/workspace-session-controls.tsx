import { useOptionalWorkoutPreload } from '@/features/workout-preload/provider';
import { useLayoutEffect, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useTrainerBilling } from '../trainer-billing/use-billing';
import { workspaceAgendaSessions } from './agenda';
import { workspaceScheduleRows } from './screen-adapter';
import {
  useWorkspaceMutations,
  useWorkspaceScreenScope,
} from './mutation-provider';
import { WorkspaceAttendanceControls } from './workspace-attendance-controls';
import {
  WorkspaceProposalControls,
  WorkspaceProposalRecovery,
} from './workspace-proposal-controls';
import type { WorkspaceSchedule } from './service';

export type WorkspaceSessionControlsProps = {
  userId: string;
  workspaceId: string;
  timezone: string;
  schedule: WorkspaceSchedule | null;
  selectedId: string | null;
  onClose: () => void;
  onRetry: () => void;
  loading?: boolean;
};

export function WorkspaceSessionControls({
  userId,
  workspaceId,
  timezone,
  schedule,
  selectedId,
  onClose,
  onRetry,
  loading = false,
}: WorkspaceSessionControlsProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const mutations = useWorkspaceMutations();
  const caller = useWorkspaceScreenScope(JSON.stringify([selectedId, loading]));
  const preload = useOptionalWorkoutPreload();
  const sheetEpoch = useRef(0);
  useLayoutEffect(() => {
    sheetEpoch.current += 1;
    return () => {
      sheetEpoch.current += 1;
    };
  }, [
    userId,
    workspaceId,
    selectedId,
    mutations.status.scopeKey,
    mutations.proposal.scopeKey,
  ]);
  const read = useTrainerBilling(userId, workspaceId);
  const retryBilling = read.retry;
  const generation = useRef(mutations.generation);
  useEffect(() => {
    if (generation.current === mutations.generation) return;
    generation.current = mutations.generation;
    retryBilling();
  }, [mutations.generation, retryBilling]);
  const refresh = () => {
    read.retry();
    onRetry();
  };
  const { billing, proposal, status, creation } = mutations;
  const proposalStore = {
    ...proposal,
    userId,
    workspaceId,
    externalBlocked:
      loading || mutations.blocked || read.loading || Boolean(read.error),
    externalBusy: billing.busy || status.busy || creation.busy,
  };
  const selected = schedule
    ? workspaceAgendaSessions(schedule).find(
        (session) => session.id === selectedId,
      )
    : null;
  const row = schedule
    ? workspaceScheduleRows(schedule, t('trainerToday.miniGroup')).find(
        (session) => session.id === selectedId,
      )
    : null;
  const dateLabel = selected
    ? new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${selected.date}T12:00:00Z`))
    : '';
  const billingCrossBusy = proposal.busy || status.busy || creation.busy;
  const statusCrossBusy = billing.busy || proposal.busy || creation.busy;
  const safeBillingPending =
    billing.pending &&
    billing.error !== 'storage' &&
    billing.error !== 'invalidPending';
  const safeStatusPending =
    status.pending &&
    status.error !== 'storage' &&
    status.error !== 'invalidPending';
  const disabled =
    mutations.blocked || loading || read.loading || Boolean(read.error);
  return (
    <View className="gap-3">
      <WorkspaceProposalRecovery store={proposalStore} />
      {billing.pending || billing.error || billing.busy ? (
        <Card>
          <Text accessibilityRole="alert">
            {t(
              `trainerBilling.${billing.error === 'storage' ? 'storageError' : billing.error === 'invalidPending' ? 'invalidPending' : billing.error === 'conflict' ? 'conflict' : billing.error === 'invalidState' ? 'invalidState' : billing.error ? 'requestError' : billing.busy ? 'busy' : 'pending'}`,
            )}
          </Text>
          <Button
            label={t(
              safeBillingPending ? 'trainerBilling.resume' : 'common.retry',
            )}
            loading={billing.busy}
            disabled={billingCrossBusy}
            onPress={() => {
              if (billingCrossBusy) return;
              if (safeBillingPending) void billing.resume();
              else {
                billing.reload();
                refresh();
              }
            }}
          />
        </Card>
      ) : null}
      {status.pending || status.error || status.busy ? (
        <Card>
          <Text accessibilityRole="alert">
            {t(
              status.error === 'storage' || status.error === 'invalidPending'
                ? 'workspaceScheduling.pendingReadError'
                : status.error === 'conflict'
                  ? 'workspaceScheduling.conflict'
                  : status.error === 'invalidState'
                    ? 'workspaceScheduling.invalidState'
                    : status.error
                      ? 'workspaceScheduling.requestError'
                      : 'workspaceScheduling.pending',
            )}
          </Text>
          <Button
            label={t(
              safeStatusPending ? 'workspaceScheduling.resume' : 'common.retry',
            )}
            loading={status.busy}
            disabled={statusCrossBusy}
            onPress={() => {
              if (statusCrossBusy) return;
              if (safeStatusPending) void status.resume();
              else status.reload();
            }}
          />
          {safeStatusPending ? (
            <Button
              label={t('workspaceScheduling.resolvePending')}
              loading={status.busy}
              disabled={statusCrossBusy}
              onPress={() => {
                if (!statusCrossBusy) void status.resolve();
              }}
            />
          ) : null}
        </Card>
      ) : null}
      {creation.pending || creation.error || creation.busy ? (
        <Card>
          <Text accessibilityRole="alert">
            {t(
              creation.error === 'storage'
                ? 'workspaceScheduling.createStorage'
                : creation.error === 'invalidPending'
                  ? 'workspaceScheduling.createInvalidPending'
                  : creation.error
                    ? 'workspaceScheduling.createError'
                    : 'workspaceScheduling.createPending',
            )}
          </Text>
          <Button
            label={t('workspaceScheduling.createResume')}
            disabled={mutations.busy}
            onPress={() => {
              if (!caller.isCurrent()) return;
              void caller.verifyCurrent().then((valid) => {
                if (valid && caller.isCurrent()) router.push('/workspace/new');
              });
            }}
          />
        </Card>
      ) : null}
      <Sheet
        open={Boolean(selected)}
        title={row?.title ?? ''}
        onClose={onClose}
      >
        {selected ? (
          <Text className="text-secondary">
            {t('trainerToday.sessionTime', {
              date: dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1),
              time: `${row?.start ?? ''}–${row?.end ?? ''}`,
            })}
          </Text>
        ) : null}
        {preload &&
        selected?.bookings.some((booking) => booking.status === 'confirmed') ? (
          <Button
            label={t('workoutPreload.preload')}
            disabled={
              loading ||
              preload.state.status === 'loading' ||
              preload.state.status === 'hydrating' ||
              preload.state.error === 'storage'
            }
            onPress={() => {
              const booking = selected.bookings.find(
                (value) => value.status === 'confirmed',
              );
              if (booking) {
                onClose();
                void preload.open(booking.id);
              }
            }}
          />
        ) : null}
        {read.error ? (
          <Card>
            <Text accessibilityRole="alert">
              {t('trainerBilling.readError')}
            </Text>
            <Button label={t('common.retry')} onPress={refresh} />
          </Card>
        ) : read.loading ? (
          <Text>{t('common.loading')}</Text>
        ) : null}
        {selected?.bookings.map((booking, index) => (
          <View key={booking.id} className="gap-2">
            {read.data && !read.error && !read.loading ? (
              <WorkspaceAttendanceControls
                booking={booking}
                data={read.data}
                workspaceId={workspaceId}
                timezone={timezone}
                disabled={disabled}
                busy={billing.busy}
                showHeading={index === 0}
                showHelp={index === selected.bookings.length - 1}
                onCommand={billing.submit}
                onRetry={refresh}
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
            {booking.status === 'proposed' || booking.status === 'confirmed' ? (
              <Button
                label={t('workspaceScheduling.cancelParticipant', {
                  name: booking.client_name,
                })}
                variant="ghost"
                disabled={disabled}
                onPress={() => {
                  if (!disabled) {
                    const epoch = sheetEpoch.current;
                    void status
                      .submit({
                        action: 'cancel',
                        bookingId: booking.id,
                        expectedRevision: booking.revision,
                        requestId: randomUUID(),
                      })
                      .then((success) => {
                        if (success && sheetEpoch.current === epoch) onClose();
                      });
                  }
                }}
              />
            ) : null}
            <WorkspaceProposalControls
              store={proposalStore}
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
  );
}

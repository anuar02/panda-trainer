import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { RescheduleSheet } from '@/features/session-editor/reschedule-sheet';
import type { EditorResult } from '@/features/session-editor/types';
import { useEditorDate } from '@/features/session-editor/date';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { Sheet } from '@/ui/sheet';
import { Icon } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import { styles as homeStyles } from '../client-home/styles';
import type { WorkspaceProposalStore } from '../workspace-scheduling/workspace-proposal-controls';
import type { ClientBookingStatusStore } from './use-status';
import {
  resolveWorkspaceLocalTime,
  workspaceDateKey,
  workspaceMinuteOfDay,
} from '../workspace-scheduling/clock';
import { scheduleClock } from '../workspace-scheduling/screen-adapter';
import type { ClientScheduleBooking, ClientScheduleProposal } from './service';
import type { WorkspaceProposalCommand } from '../workspace-scheduling/proposal-operation';

export function ClientBookingControls({
  userId,
  workspaceId,
  timezone,
  booking,
  proposals,
  proposalStore: store,
  statusStore,
  clientRecordId,
  clientName,
  blocked: externalBlocked = false,
  proposalOnly = false,
}: {
  userId: string;
  workspaceId: string;
  timezone: string;
  booking: ClientScheduleBooking;
  proposals: readonly ClientScheduleProposal[];
  proposalStore: WorkspaceProposalStore;
  statusStore: ClientBookingStatusStore;
  clientRecordId: string;
  clientName: string;
  blocked?: boolean;
  proposalOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const dateLabel = useEditorDate();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [editing, setEditing] = useState<
    ClientScheduleProposal | 'propose' | null
  >(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const cancelLocked = useRef(false);
  const pending = proposals.filter(
    (proposal) => proposal.bookingId === booking.id,
  );
  const blocked =
    cancelBusy ||
    externalBlocked ||
    booking.client_record_id !== clientRecordId ||
    booking.workspace_id !== workspaceId ||
    statusStore.loading ||
    statusStore.busy ||
    statusStore.pending !== null ||
    statusStore.error === 'storage' ||
    statusStore.error === 'invalidPending' ||
    store.externalBlocked ||
    store.externalBusy ||
    store.userId !== userId ||
    store.workspaceId !== workspaceId ||
    store.loading ||
    store.busy ||
    store.pending !== null ||
    store.error === 'storage' ||
    store.error === 'invalidPending';
  const available =
    booking.status === 'confirmed' || booking.status === 'proposed';
  const session = {
    id: booking.id,
    clientName,
    durationMinutes:
      (Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60000,
    date: workspaceDateKey(new Date(booking.starts_at), timezone),
    start: scheduleClock(
      workspaceMinuteOfDay(new Date(booking.starts_at), timezone),
    ),
    end: scheduleClock(
      workspaceMinuteOfDay(new Date(booking.ends_at), timezone),
    ),
  };
  const response = (
    proposal: ClientScheduleProposal,
    action: 'accept' | 'decline' | 'withdraw',
  ) => {
    if (blocked) return;
    void store.submit({
      action,
      bookingId: booking.id,
      expectedBookingRevision: booking.revision,
      requestId: randomUUID(),
      proposalId: proposal.id,
      expectedProposalRevision: proposal.revision,
    });
  };
  const send = (target: { date: string; start: string }): EditorResult => {
    if (blocked || !editing)
      return { ok: false, error: t('workspaceScheduling.proposalBusy') };
    try {
      const resolved = resolveWorkspaceLocalTime(
        target.date,
        target.start,
        timezone,
      );
      if (resolved.status !== 'unique')
        return { ok: false, error: t('workspaceScheduling.proposalTime') };
      const start = Date.parse(resolved.startsAtUtc);
      const duration =
        Date.parse(booking.ends_at) - Date.parse(booking.starts_at);
      const endsAt = new Date(start + duration);
      const endDate = workspaceDateKey(endsAt, timezone);
      const nextDate = new Date(
        Date.parse(`${target.date}T00:00:00Z`) + 86400000,
      )
        .toISOString()
        .slice(0, 10);
      if (
        start <= Date.now() ||
        duration <= 0 ||
        (endDate !== target.date &&
          !(
            endDate === nextDate && workspaceMinuteOfDay(endsAt, timezone) === 0
          ))
      )
        return { ok: false, error: t('workspaceScheduling.proposalTarget') };
      const base = {
        bookingId: booking.id,
        expectedBookingRevision: booking.revision,
        requestId: randomUUID(),
        proposedStartsAtUtc: resolved.startsAtUtc,
      };
      const command: WorkspaceProposalCommand =
        editing === 'propose'
          ? { ...base, action: 'propose' }
          : {
              ...base,
              action: 'counter',
              proposalId: editing.id,
              expectedProposalRevision: editing.revision,
            };
      void store.submit(command).then((result) => {
        if (result && mounted.current) setEditing(null);
      });
      return { ok: false, error: '' };
    } catch {
      return { ok: false, error: t('workspaceScheduling.proposalTarget') };
    }
  };
  return (
    <View className="gap-2">
      {!proposalOnly && booking.status === 'proposed' && (
        <Button
          label={t('schedulingDemo.confirm')}
          disabled={blocked}
          onPress={() => {
            if (!blocked)
              void statusStore.submit({
                action: 'confirm',
                bookingId: booking.id,
                expectedRevision: booking.revision,
                requestId: randomUUID(),
              });
          }}
        />
      )}
      {!proposalOnly && available && (
        <Button
          label={t('clientHome.cancel')}
          variant="ghost"
          disabled={blocked}
          onPress={() => {
            if (!blocked) setCancelOpen(true);
          }}
        />
      )}
      {!proposalOnly && available && pending.length === 0 && (
        <Button
          label={t('clientHome.propose')}
          variant="soft"
          disabled={blocked}
          onPress={() => setEditing('propose')}
        />
      )}
      {pending.map((proposal) => (
        <View
          key={proposal.id}
          style={[
            homeStyles.request,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={homeStyles.requestLabel}>
            <Icon name="swap" size={14} color={colors.warning} />
            <Text
              className="font-bold"
              style={[homeStyles.small, { color: colors.warning }]}
            >
              {t('clientHome.transfer')}
            </Text>
          </View>
          <View style={homeStyles.dates}>
            <View style={homeStyles.dateColumn}>
              <Text className="text-secondary" style={homeStyles.small}>
                {t('clientHome.current')}
              </Text>
              <Text style={homeStyles.small}>{dateLabel(session.date)}</Text>
              <Text className="font-strong" style={homeStyles.small}>
                {t('clientHome.timeStart', { start: session.start })}
                {session.end}
              </Text>
            </View>
            <Icon name="arrowRight" size={18} color={colors.ink} />
            <View style={homeStyles.dateColumn}>
              <Text className="text-secondary" style={homeStyles.small}>
                {t('clientHome.proposed')}
              </Text>
              <Text style={homeStyles.small}>
                {dateLabel(
                  workspaceDateKey(
                    new Date(proposal.proposedStartsAtUtc),
                    timezone,
                  ),
                )}
              </Text>
              <Text className="font-strong" style={homeStyles.small}>
                {t('clientHome.timeStart', {
                  start: scheduleClock(
                    workspaceMinuteOfDay(
                      new Date(proposal.proposedStartsAtUtc),
                      timezone,
                    ),
                  ),
                })}
                {scheduleClock(
                  workspaceMinuteOfDay(
                    new Date(proposal.proposedEndsAtUtc),
                    timezone,
                  ),
                )}
              </Text>
            </View>
          </View>
          <Text className="text-secondary" style={homeStyles.waiting}>
            {proposal.authorRole === 'client'
              ? t('clientHome.waiting')
              : t('schedulingDemo.unchanged', {
                  date: session.date,
                  start: session.start,
                  end: session.end,
                })}
          </Text>
          {available &&
            (proposal.authorRole === 'trainer' ? (
              <>
                <Button
                  label={t('workspaceScheduling.proposalAccept')}
                  disabled={blocked}
                  onPress={() => response(proposal, 'accept')}
                />
                <Button
                  label={t('workspaceScheduling.proposalCounter')}
                  variant="soft"
                  disabled={blocked}
                  onPress={() => setEditing(proposal)}
                />
                <Button
                  label={t('workspaceScheduling.proposalDecline')}
                  variant="ghost"
                  disabled={blocked}
                  onPress={() => response(proposal, 'decline')}
                />
              </>
            ) : (
              <Button
                label={t('workspaceScheduling.proposalWithdraw')}
                variant="ghost"
                disabled={blocked}
                onPress={() => response(proposal, 'withdraw')}
              />
            ))}
        </View>
      ))}
      <Sheet
        stackBehavior="push"
        open={cancelOpen}
        title={t('clientHome.cancelTitle')}
        onClose={() => {
          if (!cancelLocked.current && !statusStore.busy) setCancelOpen(false);
        }}
      >
        <Text>
          {t('clientHome.bookingSummary', {
            date: dateLabel(session.date),
            start: session.start,
            end: session.end,
          })}
        </Text>
        <Text className="text-secondary">{t('clientHome.cancelHint')}</Text>
        <Button
          label={t('clientHome.cancel')}
          variant="danger"
          loading={cancelBusy || statusStore.busy}
          disabled={blocked}
          onPress={() => {
            if (blocked || cancelLocked.current) return;
            cancelLocked.current = true;
            setCancelBusy(true);
            void statusStore
              .submit({
                action: 'cancel',
                bookingId: booking.id,
                expectedRevision: booking.revision,
                requestId: randomUUID(),
              })
              .then((result) => {
                if (result && mounted.current) setCancelOpen(false);
              })
              .finally(() => {
                cancelLocked.current = false;
                if (mounted.current) setCancelBusy(false);
              });
          }}
        />
        <Button
          label={t('clientHome.keep')}
          variant="soft"
          disabled={cancelBusy || statusStore.busy}
          onPress={() => {
            if (!cancelLocked.current && !statusStore.busy)
              setCancelOpen(false);
          }}
        />
      </Sheet>
      <RescheduleSheet
        stackBehavior="push"
        open={editing !== null}
        session={session}
        counter={editing !== null && editing !== 'propose'}
        initialTarget={
          editing && editing !== 'propose'
            ? {
                date: workspaceDateKey(
                  new Date(editing.proposedStartsAtUtc),
                  timezone,
                ),
                start: scheduleClock(
                  workspaceMinuteOfDay(
                    new Date(editing.proposedStartsAtUtc),
                    timezone,
                  ),
                ),
              }
            : undefined
        }
        onSubmit={send}
        onClose={() => {
          if (!store.busy) setEditing(null);
        }}
        disabled={blocked}
      />
    </View>
  );
}

export function ClientBookingStatusRecovery({
  store,
  externalBusy = false,
}: {
  store: ClientBookingStatusStore;
  externalBusy?: boolean;
}) {
  const { t } = useTranslation();
  if (!store.pending && !store.error && !store.busy) return null;
  const label =
    store.error === 'storage' || store.error === 'invalidPending'
      ? t('workspaceScheduling.pendingReadError')
      : store.error === 'conflict' || store.error === 'invalidState'
        ? t(`workspaceScheduling.${store.error}`)
        : store.error
          ? t('workspaceScheduling.requestError')
          : t('schedulingDemo.pending');
  return (
    <Card>
      <Text accessibilityRole="alert">{label}</Text>
      {store.pending &&
      store.error !== 'storage' &&
      store.error !== 'invalidPending' ? (
        <Button
          label={t('workspaceScheduling.resume')}
          loading={store.busy}
          disabled={externalBusy}
          onPress={() => {
            if (!externalBusy) void store.resume();
          }}
        />
      ) : store.error ? (
        <Button
          label={t('common.retry')}
          disabled={store.busy}
          onPress={store.reload}
        />
      ) : null}
      {store.pending &&
      store.error !== 'storage' &&
      store.error !== 'invalidPending' ? (
        <Button
          label={t('workspaceScheduling.resolvePending')}
          loading={store.busy}
          disabled={externalBusy}
          onPress={() => {
            if (!externalBusy) void store.resolve();
          }}
        />
      ) : null}
    </Card>
  );
}

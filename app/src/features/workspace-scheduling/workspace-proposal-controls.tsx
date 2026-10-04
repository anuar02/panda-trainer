import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { RescheduleSheet } from '@/features/session-editor/reschedule-sheet';
import type { EditorResult } from '@/features/session-editor/types';
import { useEditorDate } from '@/features/session-editor/date';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { useWorkspaceProposalCommands } from './use-proposal';
import {
  resolveWorkspaceLocalTime,
  workspaceDateKey,
  workspaceMinuteOfDay,
} from './clock';
import { scheduleClock } from './screen-adapter';
import type {
  WorkspaceScheduleBooking,
  WorkspaceScheduleProposal,
} from './service';
import type { WorkspaceProposalCommand } from './proposal-operation';

export type WorkspaceProposalStore = ReturnType<
  typeof useWorkspaceProposalCommands
> & {
  userId: string;
  workspaceId: string;
  externalBlocked: boolean;
  externalBusy: boolean;
};
const Context = createContext<WorkspaceProposalStore | null>(null);
export function WorkspaceProposalProvider({
  userId,
  workspaceId,
  onChanged,
  children,
  externalBlocked = false,
  externalBusy = false,
  clientRecordId,
}: {
  userId: string;
  workspaceId: string;
  onChanged: () => void;
  externalBlocked?: boolean;
  externalBusy?: boolean;
  clientRecordId?: string;
  children: ReactNode | ((store: WorkspaceProposalStore) => ReactNode);
}) {
  const store = useWorkspaceProposalCommands({
    userId,
    workspaceId,
    onChanged,
    clientRecordId,
  });
  const value = {
    ...store,
    userId,
    workspaceId,
    externalBlocked,
    externalBusy,
  };
  return (
    <Context.Provider value={value}>
      {typeof children === 'function' ? children(value) : children}
    </Context.Provider>
  );
}
export function useWorkspaceProposalState() {
  const store = useContext(Context);
  if (!store) throw new Error('Workspace proposal provider is missing');
  return store;
}
export function WorkspaceProposalRecovery({
  store: provided,
}: {
  store?: WorkspaceProposalStore;
} = {}) {
  const inherited = useContext(Context);
  const store = provided ?? inherited;
  if (!store) throw new Error('Workspace proposal provider is missing');
  const { t } = useTranslation();
  if (!store.pending && !store.error && !store.busy) return null;
  const key =
    store.error === 'storage'
      ? 'proposalStorage'
      : store.error === 'invalidPending'
        ? 'proposalInvalidPending'
        : store.error === 'conflict'
          ? 'proposalConflict'
          : store.error === 'invalidState'
            ? 'proposalInvalidState'
            : store.error
              ? 'proposalError'
              : store.busy
                ? 'proposalBusy'
                : 'proposalPending';
  return (
    <Card>
      <Text accessibilityRole="alert">{t(`workspaceScheduling.${key}`)}</Text>
      {store.pending &&
      store.error !== 'storage' &&
      store.error !== 'invalidPending' ? (
        <Button
          label={t('workspaceScheduling.proposalResume')}
          loading={store.busy}
          disabled={store.externalBusy}
          onPress={() => {
            if (!store.externalBusy) void store.resume();
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
          disabled={store.externalBusy}
          onPress={() => {
            if (!store.externalBusy) void store.resolve();
          }}
        />
      ) : null}
    </Card>
  );
}
function WorkspaceProposalControlsContent({
  userId,
  workspaceId,
  timezone,
  booking,
  proposals,
  store: suppliedStore,
}: {
  userId: string;
  workspaceId: string;
  timezone: string;
  booking: WorkspaceScheduleBooking;
  proposals: readonly WorkspaceScheduleProposal[];
  store?: WorkspaceProposalStore;
}) {
  const contextStore = useContext(Context);
  const store = suppliedStore ?? contextStore;
  if (!store) throw new Error('Workspace proposal provider is missing');
  const { t } = useTranslation();
  const dateLabel = useEditorDate();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [editing, setEditing] = useState<
    WorkspaceScheduleProposal | 'propose' | null
  >(null);
  const pending = proposals.filter(
    (proposal) =>
      proposal.booking_id === booking.id && proposal.status === 'pending',
  );
  const blocked =
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
    clientName: booking.client_name,
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
    proposal: WorkspaceScheduleProposal,
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
      {available && pending.length === 0 && (
        <Button
          label={t('sessionEditor.reschedule')}
          variant="soft"
          disabled={blocked}
          onPress={() => setEditing('propose')}
        />
      )}
      {pending.map((proposal) => (
        <View key={proposal.id} className="gap-2">
          <Text>
            {t('sessionEditor.currentTime', {
              date: dateLabel(
                workspaceDateKey(
                  new Date(proposal.proposed_starts_at),
                  timezone,
                ),
              ),
              start: scheduleClock(
                workspaceMinuteOfDay(
                  new Date(proposal.proposed_starts_at),
                  timezone,
                ),
              ),
              end: scheduleClock(
                workspaceMinuteOfDay(
                  new Date(proposal.proposed_ends_at),
                  timezone,
                ),
              ),
            })}
          </Text>
          <Text className="text-secondary">
            {t(
              proposal.authorRole === 'client'
                ? 'workspaceScheduling.proposalClient'
                : 'workspaceScheduling.proposalTrainer',
            )}
          </Text>
          {available &&
            (proposal.authorRole === 'client' ? (
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
      <RescheduleSheet
        stackBehavior="push"
        open={editing !== null}
        session={session}
        counter={editing !== null && editing !== 'propose'}
        initialTarget={
          editing && editing !== 'propose'
            ? {
                date: workspaceDateKey(
                  new Date(editing.proposed_starts_at),
                  timezone,
                ),
                start: scheduleClock(
                  workspaceMinuteOfDay(
                    new Date(editing.proposed_starts_at),
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

export function WorkspaceProposalControls(
  props: Parameters<typeof WorkspaceProposalControlsContent>[0],
) {
  const inherited = useContext(Context);
  const store = props.store ?? inherited;
  return (
    <WorkspaceProposalControlsContent
      key={JSON.stringify([
        props.userId,
        props.workspaceId,
        props.booking.id,
        props.booking.revision,
        store?.scopeKey,
        props.proposals
          .filter((row) => row.booking_id === props.booking.id)
          .map((row) => [
            row.id,
            row.revision,
            row.base_revision,
            row.authorRole,
            row.status,
          ]),
      ])}
      {...props}
    />
  );
}

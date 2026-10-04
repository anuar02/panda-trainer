import { ClientHomeFacts } from '../client-home/client-home-facts';
import { ClientSchedulingCommandBoundary } from './command-coordinator';
import type { ClientBookingStatusStore } from './use-status';
import { useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ClientHomeScreen } from '@/features/client-home/client-home-screen';
import { useWorkspaceClock } from '@/features/workspace-scheduling/use-clock';
import {
  WorkspaceProposalProvider,
  WorkspaceProposalRecovery,
  type WorkspaceProposalStore,
} from '@/features/workspace-scheduling/workspace-proposal-controls';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { clientScheduleHome } from './adapter';
import {
  ClientBookingControls,
  ClientBookingStatusRecovery,
} from './client-booking-controls';
import type { ClientScheduleBooking } from './service';
import { useClientSchedule } from './use-schedule';
import { useClientBookingStatus } from './use-status';

type Props = {
  userId: string;
  workspaceId: string;
  clientRecordId: string;
  clientName: string;
  trainerName: string;
};
export function ClientScheduleScreen(props: Props) {
  return (
    <ClientScheduleContent
      key={`${props.userId}:${props.workspaceId}:${props.clientRecordId}`}
      {...props}
    />
  );
}
function ClientScheduleContent(props: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const now = useWorkspaceClock();
  const read = useClientSchedule({
    userId: props.userId,
    clientRecordId: props.clientRecordId,
    workspaceId: props.workspaceId,
  });
  const status = useClientBookingStatus({
    userId: props.userId,
    workspaceId: props.workspaceId,
    onChanged: read.retry,
    clientRecordId: props.clientRecordId,
  });
  const screenKey = JSON.stringify([
    status.scopeKey,
    read.generation,
    read.loading,
    read.failed,
  ]);
  const generation = useRef<string | null>(screenKey);
  useLayoutEffect(() => {
    generation.current = screenKey;
    return () => {
      generation.current = null;
    };
  }, [screenKey]);
  const isCurrent = () =>
    generation.current === screenKey && !read.loading && !read.failed;
  const [selection, setSelection] = useState<{
    id: string | null;
    scope: string;
    readGeneration: string;
  } | null>(null);
  const selectedId =
    selection?.scope === status.scopeKey &&
    selection.readGeneration === read.generation
      ? selection.id
      : null;
  const setSelectedId = (id: string | null) => {
    if (isCurrent())
      setSelection({
        id,
        scope: status.scopeKey,
        readGeneration: read.generation,
      });
  };
  const home = read.schedule ? clientScheduleHome(read.schedule, now) : null;
  const context = read.schedule?.context;
  const scopeFailed = Boolean(
    context && context.workspaceId !== props.workspaceId,
  );
  const blocked =
    read.loading ||
    read.failed ||
    scopeFailed ||
    status.loading ||
    status.busy ||
    status.pending !== null ||
    status.error === 'storage' ||
    status.error === 'invalidPending';
  const selected =
    home?.bookings.find((row) => row.id === selectedId)?.booking ??
    home?.pendingProposals.find((proposal) => proposal.bookingId === selectedId)
      ?.booking;
  const controls = (
    booking: ClientScheduleBooking,
    proposal: WorkspaceProposalStore,
    proposalOnly = false,
    statusOverride: ClientBookingStatusStore = status,
  ) => (
    <ClientBookingControls
      key={booking.id}
      userId={props.userId}
      workspaceId={props.workspaceId}
      clientRecordId={props.clientRecordId}
      clientName={context?.clientName ?? props.clientName}
      timezone={context?.timezone ?? 'UTC'}
      booking={booking}
      proposals={home?.pendingProposals ?? []}
      proposalStore={proposal}
      statusStore={statusOverride}
      proposalOnly={proposalOnly}
      blocked={read.loading || read.failed || scopeFailed}
    />
  );
  return (
    <WorkspaceProposalProvider
      userId={props.userId}
      workspaceId={props.workspaceId}
      onChanged={read.retry}
      clientRecordId={props.clientRecordId}
      externalBlocked={blocked}
      externalBusy={status.busy}
    >
      {(proposal) => (
        <ClientSchedulingCommandBoundary status={status} proposal={proposal}>
          {(status, proposal) => (
            <View className="flex-1 bg-canvas">
              <WorkspaceProposalRecovery store={proposal} />
              <ClientBookingStatusRecovery
                store={status}
                externalBusy={proposal.busy}
              />
              {read.failed || scopeFailed ? (
                <Screen title={t('common.error')}>
                  <Button label={t('common.retry')} onPress={read.retry} />
                </Screen>
              ) : (
                <ClientHomeScreen
                  data={{
                    clientName: context?.clientName ?? props.clientName,
                    trainerName: context?.trainerName ?? props.trainerName,
                    timezone: context?.timezone ?? 'UTC',
                    loading: read.loading,
                    bookings: (home?.bookings ?? []).map((row) => ({
                      ...row,
                      programPreview: row.booking.program?.exercises.length
                        ? t('clientHome.programPreview', {
                            program: row.programName,
                            exercises: row.booking.program.exercises
                              .slice(0, 3)
                              .map((line) => line.exercise_name_snapshot)
                              .join(', '),
                            more:
                              row.booking.program.exercises.length > 3
                                ? t('clientHome.moreExercises', {
                                    count:
                                      row.booking.program.exercises.length - 3,
                                  })
                                : '',
                          })
                        : t('clientHome.onsite'),
                    })),
                    facts: context ? (
                      <ClientHomeFacts
                        key={read.generation}
                        userId={props.userId}
                        workspaceId={props.workspaceId}
                        clientRecordId={props.clientRecordId}
                        timezone={context.timezone}
                        now={now}
                        onOpenProgress={() => {
                          if (isCurrent())
                            router.push({
                              pathname: '/connection/[clientRecordId]/progress',
                              params: { clientRecordId: props.clientRecordId },
                            });
                        }}
                      />
                    ) : null,
                    onSelectBooking: (row) => setSelectedId(row.id),
                    onProgramPreview: () => {
                      if (!isCurrent()) return;
                      router.push({
                        pathname: '/connection/[clientRecordId]/program',
                        params: { clientRecordId: props.clientRecordId },
                      });
                    },
                    onOpenHistory: () => {
                      if (!isCurrent()) return;
                      router.push({
                        pathname: '/connection/[clientRecordId]/history',
                        params: { clientRecordId: props.clientRecordId },
                      });
                    },
                    renderActions: (row) => {
                      const booking = home?.bookings.find(
                        (value) => value.id === row.id,
                      )?.booking;
                      return booking
                        ? controls(booking, proposal, false, status)
                        : null;
                    },
                    requests: home?.pendingProposals
                      .filter((request) => request.bookingId !== home.next?.id)
                      .map((request) => (
                        <View key={request.id}>
                          {controls(request.booking, proposal, true, status)}
                        </View>
                      )),
                  }}
                />
              )}
              <Sheet
                open={
                  Boolean(selected) &&
                  !read.loading &&
                  !read.failed &&
                  !scopeFailed
                }
                title={selected?.program?.name ?? t('clientHome.onsite')}
                onClose={() => setSelectedId(null)}
              >
                {selected ? controls(selected, proposal, false, status) : null}
                {selected?.program?.description ? (
                  <Text>{selected.program.description}</Text>
                ) : null}
              </Sheet>
            </View>
          )}
        </ClientSchedulingCommandBoundary>
      )}
    </WorkspaceProposalProvider>
  );
}

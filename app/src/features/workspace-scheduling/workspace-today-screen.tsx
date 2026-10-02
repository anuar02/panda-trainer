import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TrainerTodayScreen } from '@/features/trainer-today/trainer-today-screen';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { workspaceDateKey, workspaceMinuteOfDay } from './clock';
import { scheduleClock } from './screen-adapter';
import {
  workspaceTodayAgenda,
  type TrainerTodayAgendaItem,
  type TrainerTodaySessionRow,
} from './today-adapter';
import { useWorkspaceClock } from './use-clock';
import { useWorkspaceSchedule } from './use-schedule';

type Props = {
  userId: string;
  workspaceId: string;
  timezone: string;
  trainerName: string;
};
export function WorkspaceTodayScreen(props: Props) {
  return (
    <WorkspaceTodayContent
      key={`${props.userId}:${props.workspaceId}:${props.timezone}`}
      {...props}
    />
  );
}
function WorkspaceTodayContent({
  userId,
  workspaceId,
  timezone,
  trainerName,
}: Props) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const now = useWorkspaceClock();
  const date = workspaceDateKey(now, timezone);
  const read = useWorkspaceSchedule(userId, workspaceId, date);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [overlap, setOverlap] = useState<Extract<
    TrainerTodayAgendaItem,
    { kind: 'overlap' }
  > | null>(null);
  const agenda = read.schedule
    ? workspaceTodayAgenda(read.schedule, now, t('trainerToday.miniGroup'))
    : {
        date,
        clock: scheduleClock(workspaceMinuteOfDay(now, timezone)),
        rows: [],
        pastRows: [],
        items: [],
        pendingRequestCount: 0,
        summary: {
          total: 0,
          past: 0,
          current: 0,
          future: 0,
          progressPercent: 0,
        },
        endTime: null,
      };
  const select = (row: TrainerTodaySessionRow) =>
    router.push({
      pathname: '/workspace/schedule',
      params: { date, session: row.id },
    });
  const dateLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
  const targetLabel = (value: string) =>
    `${workspaceDateKey(new Date(value), timezone)} · ${scheduleClock(workspaceMinuteOfDay(new Date(value), timezone))}`;
  if (read.failed)
    return (
      <Screen title={t('common.error')}>
        <Button label={t('common.retry')} onPress={read.retry} />
      </Screen>
    );
  return (
    <View className="flex-1 bg-canvas">
      <TrainerTodayScreen
        scenario={read.loading ? 'loading' : 'normal'}
        data={{
          trainerName,
          timezone,
          dateLabel,
          clockLabel: agenda.clock,
          agenda,
          onSelectSession: select,
          onCreate: (selectedDate, start) =>
            router.push({
              pathname: '/workspace/new',
              params: { date: selectedDate, ...(start ? { start } : {}) },
            }),
          onOpenRequests: () => setRequestsOpen(true),
          onOpenOverlap: setOverlap,
          createDisabled: read.loading,
        }}
      />
      <Sheet
        open={requestsOpen}
        title={t('trainerInbox.title')}
        onClose={() => setRequestsOpen(false)}
      >
        {read.schedule?.pendingProposals
          .filter((proposal) => proposal.authorRole === 'client')
          .map((proposal) => (
            <View key={proposal.id} className="gap-2">
              <Text className="font-strong">
                {proposal.booking.client_name}
              </Text>
              <Text>{targetLabel(proposal.booking.starts_at)}</Text>
              <Text>{targetLabel(proposal.proposed_starts_at)}</Text>
              <Button
                label={t('workspaceScheduling.open')}
                onPress={() =>
                  router.push({
                    pathname: '/workspace/schedule',
                    params: {
                      date: workspaceDateKey(
                        new Date(proposal.booking.starts_at),
                        timezone,
                      ),
                      session: proposal.booking.group_session_id
                        ? `${proposal.booking.group_session_id}:${new Date(proposal.booking.starts_at).toISOString()}:${new Date(proposal.booking.ends_at).toISOString()}`
                        : proposal.booking.id,
                    },
                  })
                }
              />
            </View>
          ))}
      </Sheet>
      <Sheet
        open={Boolean(overlap)}
        title={t('trainerSchedule.overlap')}
        onClose={() => setOverlap(null)}
      >
        {overlap
          ? agenda.rows
              .filter(
                (row) =>
                  !row.cancelled &&
                  row.startsAtUtc < overlap.endsAtUtc &&
                  row.endsAtUtc > overlap.startsAtUtc,
              )
              .map((row) => (
                <Button
                  key={row.id}
                  label={`${row.start}–${row.end} · ${row.name}`}
                  onPress={() => select(row)}
                />
              ))
          : null}
      </Sheet>
    </View>
  );
}

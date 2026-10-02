import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useClientSchedule } from '@/features/client-scheduling/use-schedule';
import { useWorkspaceClock } from '@/features/workspace-scheduling/use-clock';
import {
  workspaceDateKey,
  workspaceMinuteOfDay,
} from '@/features/workspace-scheduling/clock';
import { scheduleClock } from '@/features/workspace-scheduling/screen-adapter';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { ClientProgramScreen } from './client-program-screen';
import { useClientProgram } from './use-program';
import { clientProgramSelection } from './adapter';

type Props = {
  userId: string;
  workspaceId: string;
  clientRecordId: string;
  trainerName: string;
};
export function ClientConnectedProgramScreen(props: Props) {
  return (
    <ClientConnectedProgramContent
      key={`${props.userId}:${props.workspaceId}:${props.clientRecordId}`}
      {...props}
    />
  );
}
function ClientConnectedProgramContent(props: Props) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const now = useWorkspaceClock();
  const schedule = useClientSchedule({
    userId: props.userId,
    clientRecordId: props.clientRecordId,
  });
  const personal = useClientProgram({
    userId: props.userId,
    clientRecordId: props.clientRecordId,
  });
  const selected = schedule.schedule
    ? clientProgramSelection(
        schedule.schedule,
        now,
        personal.data?.program ?? null,
      )
    : null;
  const needsFallback =
    selected?.source === 'personal' ||
    (selected?.source === 'none' && !selected.hasUpcoming);
  const context = schedule.schedule?.context;
  const failedScope =
    (context &&
      (context.workspaceId !== props.workspaceId ||
        context.clientRecordId !== props.clientRecordId)) ||
    (needsFallback &&
      personal.data &&
      (personal.data.context.workspaceId !== props.workspaceId ||
        personal.data.context.clientRecordId !== props.clientRecordId));
  if (schedule.failed || failedScope || (needsFallback && personal.error))
    return (
      <Screen title={t('common.error')}>
        <Button
          label={t('common.retry')}
          onPress={() => {
            schedule.retry();
            personal.retry();
          }}
        />
      </Screen>
    );
  const timezone = context?.timezone ?? 'UTC';
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    })
      .format(new Date(value))
      .replaceAll('.', '');
  const time = (value: string) =>
    scheduleClock(workspaceMinuteOfDay(new Date(value), timezone));
  const session = selected?.session;
  const onSite = selected?.onSiteBooking;
  return (
    <ClientProgramScreen
      data={{
        trainerName: context?.trainerName ?? props.trainerName,
        programName: selected?.programName ?? null,
        exercises: selected?.exercises ?? [],
        loading: schedule.loading || Boolean(needsFallback && personal.loading),
        sessionLabel: session
          ? t('clientProgram.sessionLabel', {
              date: date(session.starts_at),
              start: time(session.starts_at),
              end:
                workspaceDateKey(new Date(session.ends_at), timezone) ===
                workspaceDateKey(new Date(session.starts_at), timezone)
                  ? time(session.ends_at)
                  : '24:00',
            })
          : undefined,
        onSiteLabel: onSite
          ? t('clientProgram.onSiteLabel', {
              date:
                workspaceDateKey(new Date(onSite.starts_at), timezone) ===
                workspaceDateKey(now, timezone)
                  ? t('clientHome.today')
                  : date(onSite.starts_at),
              start: time(onSite.starts_at),
            })
          : undefined,
        onOpenSchedule: () =>
          router.replace({
            pathname: '/connection/[clientRecordId]',
            params: { clientRecordId: props.clientRecordId },
          }),
      }}
    />
  );
}

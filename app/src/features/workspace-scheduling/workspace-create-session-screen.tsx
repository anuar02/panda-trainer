import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import type { SessionDraft } from '@/domain/scheduling';
import { CreateSessionScreen } from '@/features/session-editor/create-session-screen';
import type { EditorResult } from '@/features/session-editor/types';
import {
  loadWorkspaceClients,
  type WorkspaceClient,
} from '@/features/workspace-clients/service';
import { loadWorkspaceTemplates } from '@/features/workspace-library/service';
import type { WorkspaceWorkoutTemplate } from '@/features/workspace-library/adapter';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import {
  calendarWeekDateKeys,
  workspaceDateKey,
  workspaceMinuteOfDay,
  resolveWorkspaceLocalTime,
} from './clock';
import { scheduleClock } from './screen-adapter';
import { workspaceAgendaSessions } from './agenda';
import type { PendingWorkspaceBooking } from './pending';
import type { WorkspaceBookingOverlap } from './create-operation';
import {
  WorkspaceMutationBoundary,
  useWorkspaceMutations,
} from './mutation-provider';
import { useWorkspaceSchedule } from './use-schedule';
import {
  buildWorkspaceBookingCommand,
  WorkspaceBookingDraftError,
} from './draft';

type Props = {
  userId: string;
  workspaceId: string;
  timezone: string;
  initialDate?: string;
  initialStart?: string;
  onClose: () => void;
  onCreated: (date: string) => void;
};
const draftFromPending = (
  command: PendingWorkspaceBooking,
  timezone: string,
): SessionDraft => ({
  date: workspaceDateKey(new Date(command.startsAtUtc), timezone),
  start: scheduleClock(
    workspaceMinuteOfDay(new Date(command.startsAtUtc), timezone),
  ),
  duration:
    (Date.parse(command.endsAtUtc) - Date.parse(command.startsAtUtc)) / 60000,
  clientIds: [...command.clientRecordIds],
  program: command.plan?.templateId ?? null,
  programLater: !command.plan,
  collisionAck: command.collisionAcknowledged,
});
const signature = (draft: SessionDraft) =>
  JSON.stringify([
    draft.date,
    draft.start,
    draft.duration,
    [...draft.clientIds].sort(),
  ]);
const validDate = (value: string | undefined, today: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : today;
};
export function WorkspaceCreateSessionScreen(props: Props) {
  return (
    <WorkspaceMutationBoundary
      userId={props.userId}
      workspaceId={props.workspaceId}
    >
      <WorkspaceCreateSessionContent
        key={`${props.userId}:${props.workspaceId}:${props.timezone}`}
        {...props}
      />
    </WorkspaceMutationBoundary>
  );
}
function WorkspaceCreateSessionContent({
  userId,
  workspaceId,
  timezone,
  initialDate,
  initialStart,
  onClose,
  onCreated,
}: Props) {
  const { t } = useTranslation();
  const today = workspaceDateKey(new Date(), timezone);
  const date = validDate(initialDate, today);
  const completionDate = useRef(date);
  const mutations = useWorkspaceMutations();
  const creation = mutations.creation;
  const active = useRef(true);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      return () => {
        active.current = false;
      };
    }, []),
  );
  const [restoredDraft, setRestoredDraft] = useState<
    SessionDraft | null | undefined
  >(undefined);
  useEffect(() => {
    if (creation.loading || restoredDraft !== undefined) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active)
        setRestoredDraft(
          creation.pending
            ? draftFromPending(creation.pending, timezone)
            : null,
        );
    });
    return () => {
      active = false;
    };
  }, [creation.loading, creation.pending, restoredDraft, timezone]);
  const readDate =
    restoredDraft?.date ??
    (creation.pending
      ? workspaceDateKey(new Date(creation.pending.startsAtUtc), timezone)
      : date);
  const schedule = useWorkspaceSchedule(userId, workspaceId, readDate);
  const [attempt, setAttempt] = useState(0);
  const [catalogue, setCatalogue] = useState<{
    attempt: number;
    clients: WorkspaceClient[];
    templates: WorkspaceWorkoutTemplate[];
    failed: boolean;
  } | null>(null);
  const [warning, setWarning] = useState<{
    signature: string;
    overlaps: WorkspaceBookingOverlap[];
  } | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([
      loadWorkspaceClients(workspaceId),
      loadWorkspaceTemplates(workspaceId),
    ]).then(
      ([clients, templates]) => {
        if (active)
          setCatalogue({ attempt, clients, templates, failed: false });
      },
      () => {
        if (active)
          setCatalogue({ attempt, clients: [], templates: [], failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, workspaceId]);
  const current = catalogue?.attempt === attempt ? catalogue : null;
  const errorLabel =
    creation.error === 'storage'
      ? 'createStorage'
      : creation.error === 'invalidPending'
        ? 'createInvalidPending'
        : creation.error === 'conflict'
          ? 'createConflict'
          : creation.error === 'unavailable'
            ? 'createUnavailable'
            : creation.error === 'invalidInput'
              ? 'createInvalidInput'
              : 'createError';
  const recovery =
    creation.pending || creation.error ? (
      <Card>
        <Text accessibilityRole="alert">
          {t(
            `workspaceScheduling.${creation.error ? errorLabel : 'createPending'}`,
          )}
        </Text>
        {creation.pending &&
        creation.error !== 'storage' &&
        creation.error !== 'invalidPending' ? (
          <Button
            label={t('workspaceScheduling.createResume')}
            loading={creation.busy}
            onPress={() => {
              completionDate.current = workspaceDateKey(
                new Date(creation.pending!.startsAtUtc),
                timezone,
              );
              void creation.resume().then((result) => {
                if (!active.current) return;
                if (result?.created) onCreated(completionDate.current);
                if (result && !result.created)
                  setWarning({
                    signature: signature(
                      draftFromPending(creation.pending!, timezone),
                    ),
                    overlaps: result.overlaps,
                  });
              });
            }}
          />
        ) : (
          <Button
            label={t('common.retry')}
            onPress={creation.reload}
            disabled={creation.busy}
          />
        )}
      </Card>
    ) : null;
  const retry = () => {
    setAttempt((value) => value + 1);
    schedule.retry();
    creation.reload();
  };
  const blocked =
    mutations.blocked ||
    creation.loading ||
    creation.busy ||
    creation.pending !== null ||
    creation.error === 'storage' ||
    creation.error === 'invalidPending';
  const save = async (draft: SessionDraft): Promise<EditorResult> => {
    if (!current || !schedule.schedule)
      return {
        ok: false,
        error: t('workspaceScheduling.createCatalogueError'),
      };
    try {
      const command = buildWorkspaceBookingCommand({
        draft,
        clients: current.clients,
        templates: current.templates,
        timeZone: timezone,
        now: new Date(),
        requestId: randomUUID(),
      });
      completionDate.current = draft.date;
      const result = await creation.submit(command);
      if (!result)
        return { ok: false, error: t('workspaceScheduling.createError') };
      if (!result.created) {
        setWarning({ signature: signature(draft), overlaps: result.overlaps });
        return { ok: false, error: t('workspaceScheduling.createOverlap') };
      }
      if (active.current) onCreated(completionDate.current);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: t(
          error instanceof WorkspaceBookingDraftError &&
            (error.code === 'ambiguous' || error.code === 'nonexistent')
            ? 'workspaceScheduling.createTime'
            : 'workspaceScheduling.createInvalidInput',
        ),
      };
    }
  };
  return (
    <View className="flex-1 bg-canvas">
      {recovery}
      {creation.loading ||
      restoredDraft === undefined ||
      !current ||
      schedule.loading ? (
        <Screen title={t('common.loading')}>
          <Button label={t('sessionEditor.close')} onPress={onClose} />
        </Screen>
      ) : current.failed || schedule.failed ? (
        <Screen title={t('workspaceScheduling.createCatalogueError')}>
          <Button label={t('common.retry')} onPress={retry} />
          <Button label={t('sessionEditor.close')} onPress={onClose} />
        </Screen>
      ) : current.clients.length === 0 ? (
        <Screen title={t('workspaceScheduling.createEmpty')}>
          <Button label={t('sessionEditor.close')} onPress={onClose} />
        </Screen>
      ) : (
        <CreateSessionScreen
          clients={current.clients.map((client) => ({
            id: client.id,
            name: client.display_name,
            initials: client.display_name
              .trim()
              .split(/\s+/)
              .map((part) => part[0] ?? '')
              .slice(0, 2)
              .join(''),
            meta: client.programName ?? undefined,
          }))}
          templates={current.templates.map((template) => ({
            program: template.id,
            name: template.name,
            meta: t('trainerLibrary.exercises', {
              count: template.exercises.length,
            }),
          }))}
          dates={calendarWeekDateKeys(readDate)}
          today={today}
          initialDate={date}
          initialStart={
            initialStart && /^([01]\d|2[0-3]):([0-5]\d)$/.test(initialStart)
              ? initialStart
              : undefined
          }
          initialDuration={
            schedule.schedule?.availability.usual_session_minutes
          }
          initialDraft={restoredDraft ?? undefined}
          disabled={blocked}
          getCollisions={(draft) => {
            const target = resolveWorkspaceLocalTime(
              draft.date,
              draft.start,
              timezone,
            );
            const startsAt =
              target.status === 'unique'
                ? Date.parse(target.startsAtUtc)
                : null;
            const endsAt =
              startsAt === null ? null : startsAt + draft.duration * 60000;
            const local = schedule.schedule
              ? workspaceAgendaSessions(schedule.schedule)
                  .filter(
                    (session) =>
                      session.date === draft.date &&
                      session.replies.confirmed + session.replies.pending > 0 &&
                      startsAt !== null &&
                      endsAt !== null &&
                      session.bookings.some(
                        (booking) =>
                          Date.parse(booking.starts_at) < endsAt &&
                          Date.parse(booking.ends_at) > startsAt,
                      ),
                  )
                  .map((session) => ({
                    id: session.id,
                    start: scheduleClock(session.startMinute),
                    title: session.bookings
                      .map((booking) => booking.client_name)
                      .join(', '),
                  }))
              : [];
            return warning?.signature === signature(draft)
              ? [
                  ...local,
                  ...warning.overlaps
                    .filter(
                      (overlap) =>
                        !schedule.schedule?.bookings.some((booking) =>
                          overlap.bookingIds.includes(booking.id),
                        ),
                    )
                    .map((overlap, index) => ({
                      id: `server-${index}`,
                      start: scheduleClock(
                        workspaceMinuteOfDay(
                          new Date(overlap.startsAtUtc),
                          timezone,
                        ),
                      ),
                      title: t('workspaceScheduling.overlapSession'),
                    })),
                ]
              : local;
          }}
          onCreate={save}
          onClose={onClose}
        />
      )}
    </View>
  );
}

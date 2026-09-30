import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { SchedulingActor, SchedulingAction } from '@/domain/scheduling';
import { useJournalLabels } from '@/features/workout-demo';
import { RescheduleSheet } from '@/features/session-editor';
import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useSchedulingDemo } from './provider';

export function SchedulingSessionSheet({
  sessionId,
  onClose,
  actor = { role: 'trainer' },
}: {
  sessionId: string | null;
  onClose: () => void;
  actor?: SchedulingActor;
}) {
  const demo = useSchedulingDemo();
  const { t, i18n } = useTranslation();
  const labels = useJournalLabels();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const session = demo.state.sessions.find((value) => value.id === sessionId);
  const request = Object.values(demo.state.requests).find(
    (value) =>
      value.sessionId === sessionId &&
      ['pending', 'counter'].includes(value.state),
  );
  const authorized =
    actor.role === 'trainer' ||
    session?.participants.some((p) => p.clientId === actor.clientId);
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'long',
      timeZone: 'Asia/Almaty',
    }).format(new Date(`${value}T12:00:00Z`));
  const close = () => {
    setEditing(false);
    setError('');
    onClose();
  };
  const apply = (action: SchedulingAction) => {
    const result = demo.dispatch(action, actor);
    if (!result.ok) {
      const message = t(`schedulingDemo.errors.${result.error}`);
      setError(message);
      return { ok: false as const, error: message };
    }
    close();
    return { ok: true as const };
  };
  if (!session || !authorized) return null;
  const target = request?.counter ?? request?.to;
  const blocked = !demo.hydrated || demo.readError;
  const canReply = request?.awaiting === actor.role;
  const name = session.clientId
    ? t(`trainerClients.people.${session.clientId as 'c1'}.name`)
    : session.title;
  return (
    <>
      <Sheet
        open={sessionId !== null && !editing}
        title={session.title}
        onClose={close}
      >
        <Text className="text-secondary">{`${date(session.date)} · ${session.start}–${session.end}`}</Text>
        {request && target && (
          <>
            <Text className="font-bold">{t('schedulingDemo.difference')}</Text>
            <View className="flex-row justify-between gap-3">
              <View className="flex-1">
                <Text>{`${request.from.start}–${request.from.end}`}</Text>
                <Text className="text-secondary">
                  {t('schedulingDemo.current', {
                    date: date(request.from.date),
                  })}
                </Text>
              </View>
              <View className="flex-1">
                <Text>{`${target.start}–${target.end}`}</Text>
                <Text className="text-secondary">
                  {t('schedulingDemo.proposed', { date: date(target.date) })}
                </Text>
              </View>
            </View>
            <Text className="text-secondary">
              {canReply
                ? t('schedulingDemo.unchanged', request.from)
                : t(
                    actor.role === 'trainer'
                      ? 'schedulingDemo.waiting'
                      : 'schedulingDemo.waitingTrainer',
                  )}
            </Text>
            {canReply ? (
              <>
                <Button
                  label={t('schedulingDemo.accept')}
                  disabled={blocked}
                  onPress={() =>
                    apply({
                      type: 'accept',
                      requestId: request.id,
                      expectedRevision: request.revision,
                    })
                  }
                />
                <Button
                  label={t('schedulingDemo.counter')}
                  variant="soft"
                  disabled={blocked}
                  onPress={() => setEditing(true)}
                />
                <Button
                  label={t('schedulingDemo.decline', {
                    start: request.from.start,
                  })}
                  variant="ghost"
                  disabled={blocked}
                  onPress={() =>
                    apply({
                      type: 'decline',
                      requestId: request.id,
                      expectedRevision: request.revision,
                    })
                  }
                />
              </>
            ) : (
              <Button
                label={t('schedulingDemo.withdraw')}
                variant="soft"
                disabled={blocked}
                onPress={() =>
                  apply({
                    type: 'withdraw',
                    requestId: request.id,
                    expectedRevision: request.revision,
                  })
                }
              />
            )}
          </>
        )}
        {actor.role === 'trainer' && (
          <>
            <Text className="font-bold">{t('trainerToday.attendance')}</Text>
            {session.participants.map((participant) => (
              <View key={participant.clientId} className="gap-2">
                <Text>
                  {t(
                    `trainerClients.people.${participant.clientId as 'c1'}.name`,
                  )}
                </Text>
                <Text className="text-secondary">
                  {t('trainerToday.unmarked')}
                </Text>
                <View className="flex-row gap-2">
                  <Button
                    compact
                    disabled
                    variant="soft"
                    label={t('trainerToday.present')}
                  />
                  <Button
                    compact
                    disabled
                    variant="ghost"
                    label={t('trainerToday.absent')}
                  />
                </View>
              </View>
            ))}
            <Button
              label={labels.label(session.id)}
              disabled={blocked}
              onPress={() => {
                close();
                router.push({
                  pathname: '/session/[id]',
                  params: { id: session.id },
                });
              }}
            />
          </>
        )}
        {actor.role === 'client' &&
          session.participants.some(
            (p) => p.clientId === actor.clientId && p.reply === 'pending',
          ) && (
            <Button
              label={t('schedulingDemo.confirm')}
              disabled={blocked}
              onPress={() =>
                apply({
                  type: 'confirm',
                  sessionId: session.id,
                  expectedSessionRevision: session.revision,
                })
              }
            />
          )}
        {!request && (
          <Button
            label={t('trainerToday.move')}
            variant="soft"
            disabled={blocked || session.kind === 'group'}
            onPress={() => setEditing(true)}
          />
        )}
        {actor.role === 'trainer' && (
          <Button
            label={t('trainerToday.cancel')}
            variant="ghost"
            disabled={blocked}
            onPress={() =>
              apply({
                type: 'cancel',
                sessionId: session.id,
                expectedSessionRevision: session.revision,
              })
            }
          />
        )}
        {actor.role === 'trainer' && (
          <Text className="text-secondary">
            {t('trainerToday.attendanceHelp')}
          </Text>
        )}
        {(error || demo.storageStatus === 'error') && (
          <Text accessibilityRole="alert">
            {error || t('schedulingDemo.errors.storage')}
          </Text>
        )}
        {demo.storageStatus === 'error' && (
          <Button
            label={t('common.retry')}
            variant="soft"
            onPress={demo.retrySave}
          />
        )}
      </Sheet>
      <RescheduleSheet
        open={editing}
        session={{ ...session, clientName: name }}
        counter={Boolean(request)}
        initialTarget={target}
        disabled={blocked}
        onClose={() => setEditing(false)}
        onSubmit={(to) =>
          apply(
            request
              ? {
                  type: 'counter',
                  requestId: request.id,
                  expectedRevision: request.revision,
                  to,
                }
              : {
                  type: 'propose',
                  id: `r-${Date.now()}-${Object.keys(demo.state.requests).length}`,
                  sessionId: session.id,
                  expectedSessionRevision: session.revision,
                  to,
                },
          )
        }
      />
    </>
  );
}

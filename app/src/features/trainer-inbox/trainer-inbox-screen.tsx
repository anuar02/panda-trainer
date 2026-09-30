import { Fragment, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { RescheduleRequest, SchedulingAction } from '@/domain/scheduling';
import type { DemoScenario } from '@/features/demo/use-demo-scenario';
import { useSchedulingDemo } from '@/features/scheduling-demo/provider';
import { RescheduleSheet } from '@/features/session-editor';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { GradientBackground } from '@/ui/gradient-background';
import { Icon } from '@/ui/icons';
import { Mascot } from '@/ui/mascot';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';

export function TrainerInboxScreen({
  onBack,
  scenario = 'normal',
}: {
  onBack: () => void;
  scenario?: DemoScenario;
}) {
  const demo = useSchedulingDemo();
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const [editing, setEditing] = useState<RescheduleRequest | null>(null);
  const [error, setError] = useState('');
  const rows = demo.readError ? [] : Object.values(demo.state.requests);
  const active = rows.filter(
    (r) => r.state === 'pending' || r.state === 'counter',
  );
  const past = rows.filter(
    (r) => r.state !== 'pending' && r.state !== 'counter',
  );
  const blocked = !demo.hydrated || demo.readError;
  const months = t('trainerSchedule.monthsShort', { returnObjects: true });
  const date = (value: string) =>
    `${Number(value.slice(8))} ${months[Number(value.slice(5, 7)) - 1]}`;
  const person = (id: string) => t(`trainerClients.people.${id as 'c1'}.name`);
  const initials = (id: string) =>
    person(id)
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('');
  const apply = (action: SchedulingAction) => {
    const result = demo.dispatch(action, { role: 'trainer' });
    if (!result.ok) {
      const message = t(`schedulingDemo.errors.${result.error}`);
      setError(message);
      return { ok: false as const, error: message };
    }
    setError('');
    return { ok: true as const };
  };
  const avatar = (id: string) => (
    <View style={[s.avatar, { backgroundColor: colors.sunken }]}>
      <GradientBackground
        start={scheme === 'dark' ? '#232845' : '#e3e8fd'}
        end={scheme === 'dark' ? '#1b1f36' : '#d3dbfb'}
        radius={17}
      />
      <Text
        style={[
          s.initials,
          { color: scheme === 'dark' ? '#aab8ff' : '#2238b0' },
        ]}
      >
        {initials(id)}
      </Text>
    </View>
  );
  const session = demo.state.sessions.find(
    (value) => value.id === editing?.sessionId,
  );
  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={s.root}
      testID={`trainer-inbox-${scenario}`}
    >
      <View style={s.topbar}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('trainerInbox.back')}
          style={s.back}
        >
          <Icon name="chevL" size={24} color={colors.ink} />
        </Pressable>
        <Text style={s.title} accessibilityRole="header">
          {t('trainerInbox.title')}
        </Text>
        <View style={s.back} />
      </View>
      <ScrollView contentContainerStyle={s.body}>
        {(error || demo.storageStatus === 'error') && (
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
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
        <Text style={[s.label, { color: colors.secondary }]}>
          {t('trainerInbox.active')}
        </Text>
        {!demo.hydrated ? (
          <Text accessibilityRole="progressbar">{t('common.loading')}</Text>
        ) : active.length ? (
          active.map((request) => {
            const target = request.counter ?? request.to;
            const awaitingMe = request.awaiting === 'trainer';
            return (
              <Card
                key={request.id}
                flush
                style={s.card}
                testID={`request-${request.id}`}
              >
                <View style={s.person}>
                  {avatar(request.clientId)}
                  <View style={s.personBody}>
                    <Text style={s.name}>{person(request.clientId)}</Text>
                    <Text style={[s.subtitle, { color: colors.secondary }]}>
                      {t(
                        request.author === 'trainer'
                          ? 'trainerInbox.byTrainer'
                          : 'trainerInbox.byClient',
                      )}
                    </Text>
                    <View style={s.pill}>
                      <StatusPill
                        label={t(
                          awaitingMe
                            ? 'trainerInbox.waitingTrainer'
                            : 'trainerInbox.waitingClient',
                        )}
                        tone={awaitingMe ? 'warning' : 'neutral'}
                        dot={awaitingMe}
                      />
                    </View>
                  </View>
                </View>
                <View style={s.dates}>
                  {[request.from, target].map((time, index) => (
                    <Fragment key={index}>
                      {index === 1 && (
                        <Icon name="arrowRight" size={18} color={colors.ink} />
                      )}
                      <View style={s.dateColumn}>
                        <Text style={[s.small, { color: colors.secondary }]}>
                          {t(
                            index === 0
                              ? 'trainerInbox.current'
                              : 'trainerInbox.proposed',
                          )}
                        </Text>
                        <Text style={[s.small, s.date]}>{date(time.date)}</Text>
                        <Text
                          style={[s.small, s.time]}
                        >{`${time.start}–${time.end}`}</Text>
                      </View>
                    </Fragment>
                  ))}
                </View>
                {awaitingMe ? (
                  <>
                    <View style={s.actions}>
                      <Button
                        compact
                        style={s.flex}
                        label={t('trainerInbox.accept')}
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
                        compact
                        style={s.flex}
                        variant="soft"
                        label={t('trainerInbox.counter')}
                        disabled={blocked}
                        onPress={() => {
                          setError('');
                          setEditing(request);
                        }}
                      />
                    </View>
                    <View style={s.decline}>
                      <Button
                        compact
                        variant="ghost"
                        label={t('trainerInbox.decline')}
                        disabled={blocked}
                        onPress={() =>
                          apply({
                            type: 'decline',
                            requestId: request.id,
                            expectedRevision: request.revision,
                          })
                        }
                      />
                    </View>
                  </>
                ) : (
                  <View style={s.actions}>
                    <Button
                      compact
                      variant="soft"
                      label={t('trainerInbox.withdraw')}
                      disabled={blocked}
                      onPress={() =>
                        apply({
                          type: 'withdraw',
                          requestId: request.id,
                          expectedRevision: request.revision,
                        })
                      }
                    />
                  </View>
                )}
                <Text
                  style={[s.small, { color: colors.secondary, marginTop: 12 }]}
                >
                  {t(
                    request.revision === 0 &&
                      (request.id === 'r1' || request.id === 'r2')
                      ? 'trainerInbox.seedTime'
                      : 'trainerInbox.justNow',
                  )}
                </Text>
              </Card>
            );
          })
        ) : (
          !demo.readError && (
            <View
              style={[
                s.empty,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Mascot pose="sit" size={76} style={{ height: 84 }} />
              <View style={s.flex}>
                <Text style={s.emptyTitle}>{t('trainerInbox.clear')}</Text>
                <Text style={[s.emptyHint, { color: colors.secondary }]}>
                  {t('trainerInbox.clearHint')}
                </Text>
              </View>
            </View>
          )
        )}
        {demo.hydrated && past.length > 0 && (
          <>
            <Text
              style={[s.label, s.historyLabel, { color: colors.secondary }]}
            >
              {t('trainerInbox.history')}
            </Text>
            <Card flush>
              {past.map((request, index) => {
                const target = request.counter ?? request.to;
                const status =
                  request.state === 'accepted'
                    ? 'accepted'
                    : request.state === 'declined'
                      ? 'declined'
                      : 'withdrawn';
                return (
                  <View
                    key={request.id}
                    testID={`history-${request.id}`}
                    style={[
                      s.history,
                      index > 0 && {
                        borderTopWidth: 1,
                        borderTopColor:
                          scheme === 'dark' ? '#212227' : '#efefeb',
                      },
                    ]}
                  >
                    {avatar(request.clientId)}
                    <View style={s.flex}>
                      <Text style={s.historyName}>
                        {person(request.clientId)}
                      </Text>
                      <Text
                        style={[s.historyMeta, { color: colors.secondary }]}
                      >
                        {t(`trainerInbox.${status}`)}
                      </Text>
                      <Text
                        style={[s.historyMeta, { color: colors.secondary }]}
                      >{`${date(request.from.date)} · ${request.from.start} → ${date(target.date)} · ${target.start}`}</Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        )}
      </ScrollView>
      {editing && session && (
        <RescheduleSheet
          open
          session={{ ...session, clientName: person(editing.clientId) }}
          counter
          initialTarget={editing.counter ?? editing.to}
          disabled={blocked}
          onClose={() => setEditing(null)}
          onSubmit={(to) =>
            apply({
              type: 'counter',
              requestId: editing.id,
              expectedRevision: editing.revision,
              to,
            })
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Montserrat_700Bold',
    fontSize: 17,
    lineHeight: 24.65,
    letterSpacing: -0.2,
  },
  body: { paddingTop: 4, paddingHorizontal: 16, paddingBottom: 20 },
  label: {
    marginTop: 6,
    marginHorizontal: 6,
    marginBottom: 12,
    fontSize: 14,
    lineHeight: 20.3,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: { padding: 16, marginBottom: 12 },
  person: { flexDirection: 'row', gap: 12 },
  personBody: { flex: 1, minWidth: 0 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 14, fontFamily: 'Montserrat_800ExtraBold' },
  name: { fontSize: 15.5, lineHeight: 22.475, fontFamily: 'Inter_700Bold' },
  subtitle: {
    fontSize: 14,
    lineHeight: 20.3,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  pill: { marginTop: 8, alignSelf: 'flex-start' },
  dates: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  dateColumn: { flex: 1 },
  small: { fontSize: 14, lineHeight: 20.3 },
  date: { marginTop: 4 },
  time: {
    marginTop: 4,
    fontFamily: 'Inter_600SemiBold',
    fontVariant: ['tabular-nums'],
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  decline: { marginTop: 9 },
  flex: { flex: 1 },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 24,
  },
  emptyTitle: {
    fontFamily: 'Montserrat_800ExtraBold',
    fontSize: 18,
    lineHeight: 23.4,
  },
  emptyHint: { marginTop: 6, fontSize: 14, lineHeight: 21 },
  historyLabel: { marginTop: 20 },
  history: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  historyName: { fontSize: 16, lineHeight: 21.6, fontFamily: 'Inter_700Bold' },
  historyMeta: { fontSize: 14, lineHeight: 21, marginTop: 4 },
});

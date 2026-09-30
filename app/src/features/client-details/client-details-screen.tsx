import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { WorkoutSession, WorkoutState } from '@/domain/workout';
import { workoutExercises } from '@/domain/workout/fixtures';
import type { DemoScenario } from '@/features/demo/use-demo-scenario';
import { demoClients } from '@/features/trainer-clients/demo';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { GradientBackground } from '@/ui/gradient-background';
import { Icon, type IconName } from '@/ui/icons';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { parity } from '@/ui/parity-tokens';
import { clientDetailsFixtures } from './fixtures';
import { DetailsProgress } from './progress';
import { styles as s } from './styles';

export type ClientDetailsSession = WorkoutSession & {
  status?: 'proposed' | 'confirmed' | 'cancelled';
  awaiting?: 'trainer' | 'client' | null;
};

export type ClientDetailsProps = {
  clientId: string;
  scenario?: DemoScenario;
  sessions: readonly ClientDetailsSession[];
  workoutState?: WorkoutState;
  onBack: () => void;
  onOpenSession: (sessionId: string, clientId: string) => void;
  onCreateSession?: (clientId: string) => void;
  onOpenLibrary?: () => void;
};

const tabs = ['sessions', 'program', 'progress', 'billing', 'notes'] as const;

export function ClientDetailsScreen(props: ClientDetailsProps) {
  return <Details key={props.clientId} {...props} />;
}

function Details({
  clientId,
  scenario = 'normal',
  sessions,
  workoutState,
  onBack,
  onOpenSession,
  onCreateSession,
  onOpenLibrary,
}: ClientDetailsProps) {
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const [tab, setTab] = useState<(typeof tabs)[number]>('sessions');
  const person = demoClients.find((item) => item.id === clientId);
  const secondary = { color: colors.secondary };
  const muted = scheme === 'dark' ? '#0b0c0e' : '#fff';
  const hair = scheme === 'dark' ? '#212227' : '#efefeb';
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language).format(value);
  const money = (value: number) =>
    t('clientDetails.money', { amount: number(value) });
  const months = t('trainerSchedule.monthsShort', { returnObjects: true });
  const date = (value: string, long = false) =>
    long
      ? new Intl.DateTimeFormat(i18n.language, {
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        }).format(new Date(`${value}T12:00:00Z`))
      : `${Number(value.slice(8))} ${months[Number(value.slice(5, 7)) - 1]}`;
  const disabled = {
    disabled: true,
    accessibilityState: { disabled: true },
    accessibilityHint: t('clientDetails.unavailable'),
  } as const;
  const empty = (icon: IconName, title: string, hint: string) => (
    <Card style={s.empty}>
      <Icon name={icon} size={24} color={colors.secondary} />
      <Text style={s.heading}>{title}</Text>
      <Text style={[s.small, secondary, s.center]}>{hint}</Text>
    </Card>
  );
  const kv = (rows: [string, string][]) => (
    <View>
      {rows.map(([label, value]) => (
        <View key={label} style={[s.kv, { borderBottomColor: hair }]}>
          <Text style={[s.small, secondary, s.flex]}>{label}</Text>
          <Text style={[s.small, s.kvValue]}>{value}</Text>
        </View>
      ))}
    </View>
  );
  const toolbar = (
    <View style={s.topbar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('clientDetails.back')}
        onPress={onBack}
        style={s.iconButton}
      >
        <Icon name="chevL" size={22} color={colors.ink} />
      </Pressable>
      {clientId === 'c6' && (
        <Button
          label={t('clientDetails.invite')}
          variant="ghost"
          compact
          {...disabled}
        />
      )}
    </View>
  );
  if (!person)
    return (
      <SafeAreaView style={s.root}>
        {toolbar}
        <Text style={s.content}>{t('clientDetails.notFound')}</Text>
      </SafeAreaView>
    );
  const id = person.id;
  const details = clientDetailsFixtures[id];
  const program =
    id === 'c6' || id === 'c7'
      ? null
      : t(`trainerClients.people.${id}.program`);
  const exercises = workoutExercises(program);
  const own =
    scenario === 'empty'
      ? []
      : sessions.filter(
          (session) =>
            session.clientId === id ||
            session.participants.some(
              (participant) => participant.clientId === id,
            ),
        );
  const purchase = scenario === 'empty' ? undefined : details.purchase;
  const title = t(`clientDetails.people.${id}.plan`);
  const notes =
    scenario === 'empty'
      ? []
      : own.flatMap((session) =>
          (workoutState?.sessions[session.id]?.notes?.[id] ?? []).map(
            (note, index) => ({
              ...note,
              key: `${session.id}:${index}`,
              sessionId: session.id,
              date: session.date,
            }),
          ),
        );
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`client-details-${scenario}`}
    >
      {toolbar}
      {scenario === 'loading' ? (
        <ActivityIndicator
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('clientDetails.loading')}
          style={s.loading}
        />
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          <View style={s.header}>
            <View style={s.identity}>
              <View style={s.avatar}>
                <GradientBackground
                  start={scheme === 'dark' ? '#232845' : '#e3e8fd'}
                  end={scheme === 'dark' ? '#1b1f36' : '#d3dbfb'}
                  radius={21}
                />
                <Text
                  style={[
                    s.initials,
                    { color: scheme === 'dark' ? '#aab8ff' : '#2238b0' },
                  ]}
                >
                  {t(`trainerClients.people.${id}.initials`)}
                </Text>
              </View>
              <View style={s.flex}>
                <Text style={s.name}>
                  {t(`trainerClients.people.${id}.name`)}
                </Text>
                <Text style={[s.small, secondary]}>{title}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('clientDetails.actions')}
                style={s.iconButton}
                {...disabled}
              >
                <Icon name="more" size={22} color={colors.ink} />
              </Pressable>
            </View>
            <View style={s.metrics}>
              <Card flush style={s.metric}>
                <Text style={[s.label, s.metricLabel, secondary]}>
                  {t('clientDetails.balance')}
                </Text>
                <Text style={s.balance}>{person.remaining ?? 0}</Text>
              </Card>
              <Card flush style={s.metric}>
                <Text style={[s.label, s.metricLabel, secondary]}>
                  {t('clientDetails.due')}
                </Text>
                <Text
                  style={[
                    s.due,
                    person.due > 0 && { color: parity[scheme].warning.color },
                  ]}
                >
                  {money(person.due)}
                </Text>
              </Card>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.tabs}
            accessibilityLabel={t('clientDetails.sections')}
          >
            {tabs.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === value }}
                onPress={() => setTab(value)}
                style={[
                  s.chip,
                  {
                    backgroundColor: tab === value ? colors.ink : colors.sunken,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    s.chipText,
                    { color: tab === value ? muted : colors.secondary },
                  ]}
                >
                  {t(`clientDetails.${value}`)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {scenario === 'offline' && (
            <Text
              accessibilityRole="alert"
              style={[s.content, s.small, secondary]}
            >
              {t('clientDetails.offline')}
            </Text>
          )}
          <View style={s.content}>
            {tab === 'sessions' && (
              <View style={s.stack}>
                {own.length ? (
                  <Card flush style={s.rows}>
                    {own.map((session, index) => (
                      <Pressable
                        key={session.id}
                        testID={`client-session-${session.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${date(session.date)} · ${session.start}–${session.end}`}
                        onPress={() => onOpenSession(session.id, id)}
                        style={[
                          s.sessionRow,
                          s.bookingRow,
                          index > 0 && {
                            borderTopWidth: 1,
                            borderTopColor: hair,
                          },
                        ]}
                      >
                        <View style={s.bookingInfo}>
                          <Text style={[s.rowTitle, s.bookingTitle]}>
                            {t('clientDetails.sessionDate', {
                              date: date(session.date),
                              start: session.start,
                              end: session.end,
                            })}
                          </Text>
                          <Text style={[s.small, s.bookingMeta, secondary]}>
                            {t('clientDetails.sessionMeta', {
                              program:
                                session.program ?? t('clientDetails.later'),
                              kind: t(
                                `clientDetails.${session.kind === 'group' ? 'group' : 'personal'}`,
                              ),
                            })}
                          </Text>
                        </View>
                        <StatusPill
                          label={t(
                            session.status === 'cancelled'
                              ? 'clientDetails.cancelled'
                              : session.awaiting === 'trainer'
                                ? 'clientDetails.awaiting'
                                : session.awaiting === 'client'
                                  ? 'clientDetails.awaitingClient'
                                  : session.status === 'proposed'
                                    ? 'clientDetails.proposed'
                                    : 'clientDetails.confirmed',
                          )}
                          tone={
                            session.status === 'cancelled' ||
                            session.awaiting === 'client'
                              ? 'neutral'
                              : session.awaiting === 'trainer' ||
                                  session.status === 'proposed'
                                ? 'warning'
                                : 'success'
                          }
                          dot={
                            session.status !== 'cancelled' &&
                            session.awaiting !== 'client'
                          }
                        />
                      </Pressable>
                    ))}
                  </Card>
                ) : (
                  empty(
                    'calendar',
                    t('clientDetails.noSessions'),
                    t('clientDetails.noSessionsHint'),
                  )
                )}
                <Button
                  label={t('clientDetails.create')}
                  variant="soft"
                  icon={<Icon name="plus" size={18} color={colors.ink} />}
                  disabled={!onCreateSession}
                  onPress={() => onCreateSession?.(id)}
                />
              </View>
            )}
            {tab === 'program' && (
              <View style={s.stack}>
                {program && (
                  <View
                    style={[
                      s.notice,
                      {
                        backgroundColor: parity[scheme].accent.backgroundColor,
                      },
                    ]}
                  >
                    <Icon
                      name="info"
                      size={18}
                      color={parity[scheme].accent.color}
                    />
                    <Text
                      style={[
                        s.small,
                        s.flex,
                        { color: parity[scheme].accent.color },
                      ]}
                    >
                      {t('clientDetails.template', { program })}
                    </Text>
                  </View>
                )}
                {exercises.length ? (
                  <Card flush style={s.rows}>
                    {exercises.map((exercise, index) => (
                      <View
                        key={exercise.id}
                        style={[
                          s.sessionRow,
                          index > 0 && {
                            borderTopWidth: 1,
                            borderTopColor: hair,
                          },
                        ]}
                      >
                        <View
                          style={[
                            s.numberLead,
                            {
                              backgroundColor:
                                parity[scheme].accent.backgroundColor,
                            },
                          ]}
                        >
                          <Text>{index + 1}</Text>
                        </View>
                        <View style={s.flex}>
                          <Text style={s.rowTitle}>{exercise.name}</Text>
                          <Text style={[s.small, secondary]}>
                            {t('clientDetails.exercisePlan', {
                              sets: exercise.sets,
                              reps: exercise.reps,
                            })}
                            {exercise.target
                              ? ` · ${t('clientDetails.weight', { amount: number(exercise.target) })}`
                              : ''}
                          </Text>
                        </View>
                        {exercise.pr > 0 && (
                          <View style={s.trophy}>
                            <Icon
                              name="trophy"
                              size={14}
                              color={parity[scheme].warning.color}
                            />
                            <Text
                              style={[
                                s.small,
                                { color: parity[scheme].warning.color },
                              ]}
                            >
                              {number(exercise.pr)}
                            </Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </Card>
                ) : (
                  <View style={s.stack}>
                    {empty(
                      'dumbbell',
                      t('clientDetails.noProgram'),
                      t('clientDetails.noProgramHint'),
                    )}
                    <Button
                      label={t('clientDetails.library')}
                      variant="soft"
                      disabled={!onOpenLibrary}
                      onPress={onOpenLibrary}
                    />
                  </View>
                )}
              </View>
            )}
            {tab === 'progress' && (
              <DetailsProgress
                clientId={id}
                sessions={sessions}
                workoutState={workoutState}
                empty={scenario === 'empty'}
              />
            )}
            {tab === 'billing' && (
              <View style={s.stack}>
                {purchase ? (
                  <Card>
                    <View style={s.purchaseHeader}>
                      <Text style={[s.rowTitle, s.flex]}>{title}</Text>
                      <StatusPill
                        label={
                          person.due
                            ? `${t('clientDetails.due')} ${money(person.due)}`
                            : t('clientDetails.paid')
                        }
                        tone={person.due ? 'warning' : 'success'}
                      />
                    </View>
                    {kv([
                      [t('clientDetails.cost'), money(purchase.price)],
                      [t('clientDetails.received'), money(purchase.paid)],
                      [
                        t('clientDetails.lessons'),
                        t('clientDetails.used', purchase),
                      ],
                      [
                        t('clientDetails.expires'),
                        purchase.expires
                          ? date(purchase.expires)
                          : t('clientDetails.unlimited'),
                      ],
                    ])}
                    <Button
                      label={t('clientDetails.recordPayment')}
                      compact
                      variant="soft"
                      {...disabled}
                    />
                  </Card>
                ) : (
                  empty(
                    'wallet',
                    t('clientDetails.noPurchases'),
                    t('clientDetails.noPurchasesHint'),
                  )
                )}
                <Text style={[s.label, secondary]}>
                  {t('clientDetails.payments')}
                </Text>
                {purchase &&
                (id === 'c1' || id === 'c2' || id === 'c4' || id === 'c5') ? (
                  <Card>
                    <View style={s.purchaseHeader}>
                      <Icon
                        name="wallet"
                        size={20}
                        color={parity[scheme].success.color}
                      />
                      <View style={s.flex}>
                        <Text style={s.rowTitle}>{money(purchase.paid)}</Text>
                        <Text style={[s.small, secondary]}>
                          {t('clientDetails.paymentMeta', {
                            date: date(purchase.date, true),
                            method: t(`clientDetails.paymentMethods.${id}`),
                          })}
                        </Text>
                      </View>
                      <StatusPill label={t('clientDetails.recorded')} />
                    </View>
                  </Card>
                ) : (
                  <Card>
                    <Text style={[s.small, secondary]}>
                      {t('clientDetails.noPayments')}
                    </Text>
                  </Card>
                )}
              </View>
            )}
            {tab === 'notes' && (
              <View style={s.stack}>
                <Text style={[s.label, secondary]}>
                  {t('clientDetails.planGoal')}
                </Text>
                <Card>
                  {kv([
                    [
                      t('clientDetails.goal'),
                      t(`clientDetails.people.${id}.goal`) ||
                        t('clientDetails.dash'),
                    ],
                    [
                      t('clientDetails.program'),
                      program ?? t('clientDetails.dash'),
                    ],
                    [
                      t('clientDetails.completed'),
                      t('clientDetails.completedValue', {
                        count: details.completed,
                      }),
                    ],
                    [
                      t('clientDetails.joined'),
                      t('clientDetails.since', { date: date(details.joined) }),
                    ],
                  ])}
                </Card>
                {(['note', 'comment'] as const).map((kind) => (
                  <View key={kind} style={s.stack}>
                    <Text style={[s.label, secondary]}>
                      {t(
                        `clientDetails.${kind === 'note' ? 'privateNote' : 'publicNote'}`,
                      )}
                    </Text>
                    <Card>
                      <View style={s.noticeRow}>
                        <Icon
                          name={kind === 'note' ? 'lock' : 'eye'}
                          size={18}
                          color={colors.secondary}
                        />
                        <Text style={[s.small, s.flex]}>
                          {t(`clientDetails.people.${id}.${kind}`) ||
                            t(
                              `clientDetails.${kind === 'note' ? 'noNotes' : 'noComment'}`,
                            )}
                        </Text>
                      </View>
                    </Card>
                  </View>
                ))}
                {notes.map((note) => (
                  <Pressable
                    key={note.key}
                    accessibilityRole="button"
                    onPress={() => onOpenSession(note.sessionId, id)}
                  >
                    <Card>
                      <Text style={[s.small, secondary]}>
                        {t('clientDetails.noteMeta', {
                          date: date(note.date),
                          time: note.at,
                          visibility: t(
                            `clientDetails.${note.shared ? 'publicNote' : 'privateNote'}`,
                          ),
                        })}
                      </Text>
                      <Text style={s.small}>{note.text}</Text>
                    </Card>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

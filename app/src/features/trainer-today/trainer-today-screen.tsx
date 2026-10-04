import { Mascot } from '@/ui/mascot';
import { useState, type ReactNode } from 'react';
import type {
  TrainerTodayAgenda,
  TrainerTodaySessionRow,
  TrainerTodayAgendaItem,
} from '@/features/workspace-scheduling/today-adapter';
import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { GradientBackground } from '@/ui/gradient-background';
import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icons';
import { ScreenHeader } from '@/ui/screen-header';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import {
  demoLastSession,
  demoPastSessions,
  type DemoSession,
  type TodayScenario,
} from './demo';
import { getTodayStyles } from './measurements';
import { useCalmMode } from '@/ui/calm-mode';
import { MotionView } from '@/ui/motion';
import { StatusPill } from '@/ui/status-pill';
import { useJournalLabels } from '@/features/workout-demo';
import {
  createSchedulingState,
  schedulingToday,
  schedulingNow,
  type SchedulingSession,
} from '@/domain/scheduling';
import { useOptionalSchedulingDemo } from '@/features/scheduling-demo/provider';
import { SchedulingSessionSheet } from '@/features/scheduling-demo/session-sheet';

function Gradient({
  start,
  end,
  startOpacity,
  endOpacity,
  radius,
}: {
  id: string;
  start: string;
  end: string;
  startOpacity?: number;
  endOpacity?: number;
  radius?: number;
}) {
  return (
    <GradientBackground
      start={start}
      end={end}
      startOpacity={startOpacity}
      endOpacity={endOpacity}
      radius={radius}
    />
  );
}

function Glow({
  color,
  opacity,
  radius,
}: {
  id: string;
  color: string;
  opacity: number;
  radius: number;
}) {
  return (
    <GradientBackground
      radials={[
        {
          color,
          opacity,
          cx: 0.5,
          cy: 0.5,
          rx: radius,
          ry: radius,
          stop: 0.65,
        },
      ]}
    />
  );
}

function Time({
  start,
  end,
  expanded = false,
}: {
  start: string;
  end: string;
  expanded?: boolean;
}) {
  const { fontScale, width } = useWindowDimensions();
  const s = getTodayStyles(fontScale, width);
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={s.time}>
      <Text style={[s.timeText, expanded && s.timeExpanded]}>{start}</Text>
      <Text style={[s.endTime, { color: colors.secondary }]}>
        {t('trainerToday.until', { time: end })}
      </Text>
    </View>
  );
}

export type TrainerTodayData = {
  trainerName: string;
  notificationAction?: ReactNode;
  timezone: string;
  onOpenOverlap?: (
    overlap: Extract<TrainerTodayAgendaItem, { kind: 'overlap' }>,
  ) => void;
  dateLabel: string;
  clockLabel: string;
  agenda: TrainerTodayAgenda;
  onSelectSession: (session: TrainerTodaySessionRow) => void;
  onCreate: (date: string, start?: string) => void;
  onOpenRequests: () => void;
  createDisabled?: boolean;
};

export function TrainerTodayScreen({
  scenario = 'normal',
  data,
}: {
  scenario?: TodayScenario;
  data?: TrainerTodayData;
}) {
  const { fontScale, width } = useWindowDimensions();
  const s = getTodayStyles(fontScale, width);
  const calmMode = useCalmMode();
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const [pastOpen, setPastOpen] = useState(false);
  const [selected, setSelected] = useState<DemoSession | 'group' | null>(null);
  const journal = useJournalLabels();
  const schedulingContext = useOptionalSchedulingDemo();
  const scheduling = data ? null : schedulingContext;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const todaySessions = (scheduling?.state.sessions ?? [])
    .filter(
      (session) =>
        session.date === schedulingToday && session.status !== 'cancelled',
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const initialSessions = createSchedulingState().sessions.filter(
    (session) => session.date === schedulingToday,
  );
  const changed =
    data !== undefined ||
    (scheduling !== null &&
      (todaySessions.length !== initialSessions.length ||
        todaySessions.some(
          (session) =>
            !initialSessions.some(
              (initial) =>
                initial.id === session.id &&
                initial.start === session.start &&
                initial.end === session.end &&
                initial.program === session.program,
            ),
        )));
  const pending = Object.values(scheduling?.state.requests ?? {}).filter(
    (request) =>
      request.awaiting === 'trainer' &&
      (request.state === 'pending' || request.state === 'counter'),
  );
  const openRequests = () =>
    data ? data.onOpenRequests() : router.push('/inbox');
  const create = (start?: string) => {
    if (data) {
      if (!data.createDisabled) data.onCreate(data.agenda.date, start);
      return;
    }
    router.push({
      pathname: '/new',
      params: { date: schedulingToday, ...(start ? { start } : {}) },
    });
  };
  const select = (session: DemoSession | 'group') =>
    scheduling
      ? setSelectedId(session === 'group' ? 's6' : session.id)
      : setSelected(session);
  const currentCount =
    data?.agenda.summary.current ??
    todaySessions.filter(
      (session) =>
        session.start <= schedulingNow && session.end > schedulingNow,
    ).length;
  const pastCount =
    data?.agenda.summary.past ??
    todaySessions.filter((session) => session.end <= schedulingNow).length;
  const totalCount = data?.agenda.summary.total ?? todaySessions.length;
  const futureCount = totalCount - currentCount - pastCount;
  const requestCount = data?.agenda.pendingRequestCount ?? pending.length;

  const secondary = { color: colors.secondary };
  const accent = { color: scheme === 'dark' ? '#8c9eff' : colors.accent };
  const hair = scheme === 'dark' ? '#212227' : '#efefeb';
  const disabled = { disabled: true };

  function sessionEntry(session: DemoSession, past = false) {
    const name = t(`trainerToday.people.${session.person}`);
    return (
      <View key={session.id} style={[s.entry, { borderTopColor: hair }]}>
        <View style={s.row}>
          <Time start={session.start} end={session.end} />
          <View style={s.main}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('trainerToday.sessionLabel', {
                name,
                start: session.start,
                end: session.end,
              })}
              onPress={() => select(session)}
              style={s.nameButton}
            >
              <Text style={s.compactName}>{name}</Text>
              <View style={s.actions}>
                {past && (
                  <Text style={[s.small, secondary]}>
                    {t('trainerToday.elapsed')}
                  </Text>
                )}
                <Icon name="chevR" size={16} color={colors.control} />
              </View>
            </Pressable>
            <View style={s.program}>
              <Text style={[s.programText, s.strong]}>
                {session.program
                  ? t(`trainerToday.programs.${session.program}`)
                  : t('trainerToday.noProgram')}
              </Text>
              {!session.program && (
                <Pressable
                  disabled
                  accessibilityRole="button"
                  accessibilityState={disabled}
                  style={s.programPicker}
                >
                  <Text style={[s.programText, s.strong, accent]}>
                    {t('trainerToday.chooseProgram')}
                  </Text>
                </Pressable>
              )}
              <Text style={[s.programText, secondary]}>
                {t('trainerToday.personal')}
              </Text>
            </View>
            {journal.status(session.id) && (
              <StatusPill label={journal.status(session.id)!} />
            )}
          </View>
        </View>
      </View>
    );
  }

  function liveEntry(session: SchedulingSession) {
    const active =
      session.start <= schedulingNow && session.end > schedulingNow;
    const name = session.clientId
      ? t(`trainerClients.people.${session.clientId as 'c1'}.name`)
      : session.title;
    return (
      <View key={session.id} style={[s.entry, { borderTopColor: hair }]}>
        {active && (
          <>
            <View
              style={[s.activeStripe, { backgroundColor: colors.accent }]}
            />
            <View style={s.caption}>
              <Text style={[s.small, secondary]}>
                {t('trainerToday.happening')}
              </Text>
              <Text style={[s.small, s.strong, { color: colors.accent }]}>
                {t('trainerToday.until', { time: session.end })}
              </Text>
            </View>
          </>
        )}
        <View style={s.row}>
          <Time start={session.start} end={session.end} expanded={active} />
          <View style={s.main}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('trainerToday.sessionLabel', {
                name,
                start: session.start,
                end: session.end,
              })}
              onPress={() => setSelectedId(session.id)}
              style={s.nameButton}
            >
              <Text style={s.compactName}>{name}</Text>
              <Icon name="chevR" size={16} color={colors.control} />
            </Pressable>
            <View style={s.program}>
              <Text style={[s.programText, s.strong]}>
                {session.program ?? t('trainerToday.noProgram')}
              </Text>
              <Text style={[s.programText, secondary]}>
                {t(
                  session.kind === 'group'
                    ? 'trainerToday.miniGroup'
                    : 'trainerToday.personal',
                )}
              </Text>
            </View>
            {journal.status(session.id) && (
              <StatusPill label={journal.status(session.id)!} />
            )}
          </View>
        </View>
        {active &&
          !(
            journal.draft(session.id) && journal.dockSessionId === session.id
          ) && (
            <Button
              label={journal.label(session.id)}
              onPress={() =>
                router.push({
                  pathname: '/session/[id]',
                  params: { id: session.id },
                })
              }
              style={s.cta}
            />
          )}
      </View>
    );
  }

  function liveAgenda() {
    const past = todaySessions.filter(
      (session) => session.end <= schedulingNow,
    );
    const upcoming = todaySessions.filter(
      (session) => session.end > schedulingNow,
    );
    const minutes = (time: string) =>
      Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    return (
      <>
        {past.length > 0 && (
          <View style={s.past}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: pastOpen }}
              onPress={() => setPastOpen(!pastOpen)}
              style={s.toggle}
            >
              <Icon
                name="check"
                size={16}
                color={colors.success}
                strokeWidth={2.4}
              />
              <Text style={[s.pastLabel, secondary]}>
                {t('trainerToday.pastCount', { count: past.length })}
              </Text>
              <Text style={[s.small, s.strong, accent]}>
                {t(pastOpen ? 'trainerToday.hide' : 'trainerToday.show')}
              </Text>
            </Pressable>
            {pastOpen && past.map(liveEntry)}
          </View>
        )}
        {upcoming.map((session, index) => {
          const previous = upcoming[index - 1];
          const gap = previous
            ? minutes(session.start) - minutes(previous.end)
            : 0;
          return (
            <View key={session.id}>
              {previous && gap > 0 && (
                <Pressable
                  onPress={() => create(previous.end)}
                  accessibilityRole="button"
                  style={[s.gap, { borderTopColor: colors.border }]}
                >
                  <View style={[s.gapBorder, { borderColor: colors.border }]} />
                  <View style={s.time}>
                    <Text style={[s.gapTime, secondary]}>{previous.end}</Text>
                    <Text style={[s.endTime, secondary]}>
                      {t('trainerToday.until', { time: session.start })}
                    </Text>
                  </View>
                  <View style={s.main}>
                    <Text style={[s.small, s.strong]}>
                      {t('trainerToday.freeMinutes', { count: gap })}
                    </Text>
                    <Text style={[s.endTime, secondary]}>
                      {t('trainerToday.add')}
                    </Text>
                  </View>
                  <Icon name="plus" size={19} color={colors.secondary} />
                </Pressable>
              )}
              {liveEntry(session)}
            </View>
          );
        })}
      </>
    );
  }

  function controlledEntry(session: TrainerTodaySessionRow) {
    if (!data) return null;
    const active = session.role === 'now';
    const expanded = session.role !== null;
    const past = session.past;
    const group = session.groupSessionId !== null;
    const name = session.name;
    return (
      <View key={session.id} style={[s.entry, { borderTopColor: hair }]}>
        {active && (
          <>
            <Gradient
              id={`today-real-${session.id}`}
              start={scheme === 'dark' ? '#6f86ff' : '#2b48d6'}
              end="#000000"
              startOpacity={0.06}
              endOpacity={0}
            />
            <View
              style={[s.activeStripe, { backgroundColor: colors.accent }]}
            />
            <View style={s.caption}>
              <Text style={[s.small, secondary]}>
                {t('trainerToday.happening')}
              </Text>
              <Text style={[s.small, s.strong, { color: colors.accent }]}>
                {t('trainerToday.until', { time: session.end })}
              </Text>
            </View>
          </>
        )}
        {session.role === 'next' && (
          <View style={s.caption}>
            <Text style={[s.small, secondary]}>
              {t('trainerToday.nextSession')}
            </Text>
          </View>
        )}
        <View style={s.row}>
          <Time start={session.start} end={session.end} expanded={expanded} />
          <View style={s.main}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('trainerToday.sessionLabel', {
                name,
                start: session.start,
                end: session.end,
              })}
              onPress={() => data.onSelectSession(session)}
              style={s.nameButton}
            >
              <Text style={expanded ? s.name : s.compactName}>{name}</Text>
              <View style={s.actions}>
                {past && !session.cancelled && (
                  <Text style={[s.small, secondary]}>
                    {t('trainerToday.elapsed')}
                  </Text>
                )}
                <Icon name="chevR" size={16} color={colors.control} />
              </View>
            </Pressable>
            <View style={s.program}>
              <Text style={[s.programText, s.strong]}>
                {group
                  ? (session.participantNames.join(', ') ?? '')
                  : (session.programName ?? t('trainerToday.noProgram'))}
              </Text>
              {!group && (
                <Text style={[s.programText, secondary]}>
                  {t('trainerToday.personal')}
                </Text>
              )}
            </View>
            {group && session.programName && (
              <Text style={[s.programText, secondary]}>
                {session.programName}
              </Text>
            )}
            {group && !expanded && (
              <Text style={[s.small, secondary]}>
                {t('schedulingDemo.groupReplies', session.replies)}
              </Text>
            )}
            {group && expanded && session.replies && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(
                  'trainerToday.participantsDynamic',
                  session.replies,
                )}
                onPress={() => data.onSelectSession(session)}
                style={s.rsvp}
              >
                <View style={s.rsvpItems}>
                  {(
                    [
                      ['check', colors.success, session.replies.confirmed],
                      ['clock', colors.warning, session.replies.pending],
                      ['close', colors.control, session.replies.cancelled],
                    ] as const
                  ).map(([name, color, count]) => (
                    <View key={name} style={s.rsvpItem}>
                      <Icon
                        name={name}
                        color={color}
                        size={14}
                        strokeWidth={2.4}
                      />
                      <Text style={[s.small, s.strong, secondary]}>
                        {count}
                      </Text>
                    </View>
                  ))}
                </View>
                <Icon name="chevR" size={15} color={colors.control} />
              </Pressable>
            )}
            {session.cancelled && (
              <StatusPill label={t('trainerToday.cancelled')} />
            )}
            {!session.cancelled && !group && session.replies.pending > 0 && (
              <StatusPill label={t('schedulingDemo.pending')} />
            )}
          </View>
        </View>
        {!session.cancelled && session.pendingProposalIds.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={data.onOpenRequests}
            style={s.caption}
          >
            <Icon name="swap" size={16} color={colors.warning} />
            <Text style={[s.small, { color: colors.warning }]}>
              {t('trainerToday.requestReply')}
            </Text>
            <Icon name="chevR" size={14} color={colors.control} />
          </Pressable>
        )}
      </View>
    );
  }
  function controlledGap(
    window: Extract<TrainerTodayAgendaItem, { kind: 'gap' }>,
  ) {
    return (
      <Pressable
        key={`${window.start}-${window.end}`}
        disabled={data?.createDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: data?.createDisabled ?? false }}
        onPress={() => create(window.start)}
        style={[s.gap, { borderTopColor: colors.border }]}
      >
        <View style={[s.gapBorder, { borderColor: colors.border }]} />
        <View style={s.time}>
          <Text style={[s.gapTime, secondary]}>{window.start}</Text>
          <Text style={[s.endTime, secondary]}>
            {t('trainerToday.until', { time: window.end })}
          </Text>
        </View>
        <View style={s.main}>
          <Text style={[s.small, s.strong]}>
            {t('trainerToday.freeMinutes', {
              count: window.durationMinutes,
            })}
          </Text>
          <Text style={[s.endTime, secondary]}>{t('trainerToday.add')}</Text>
        </View>
        <Icon name="plus" size={19} color={colors.secondary} />
      </Pressable>
    );
  }
  function controlledAgenda() {
    if (!data) return null;
    const past = data.agenda.pastRows;
    return (
      <>
        {past.length > 0 && (
          <View style={s.past}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: pastOpen }}
              onPress={() => setPastOpen(!pastOpen)}
              style={s.toggle}
            >
              <Icon
                name="check"
                size={16}
                color={colors.success}
                strokeWidth={2.4}
              />
              <Text style={[s.pastLabel, secondary]}>
                {t('trainerToday.pastCount', { count: past.length })}
              </Text>
              <Text style={[s.small, s.strong, accent]}>
                {t(pastOpen ? 'trainerToday.hide' : 'trainerToday.show')}
              </Text>
            </Pressable>
            {pastOpen && past.map(controlledEntry)}
          </View>
        )}
        {data.agenda.items.map((item, index) =>
          item.kind === 'session' ? (
            controlledEntry(item.row)
          ) : item.kind === 'gap' ? (
            controlledGap(item)
          ) : (
            <Pressable
              key={`overlap-${index}`}
              disabled={!data.onOpenOverlap}
              accessibilityRole="button"
              accessibilityState={{ disabled: !data.onOpenOverlap }}
              accessibilityLabel={t('trainerToday.overlapLabel', {
                start: new Intl.DateTimeFormat('en-GB', {
                  timeZone: data.timezone,
                  hour: '2-digit',
                  minute: '2-digit',
                  hourCycle: 'h23',
                }).format(new Date(item.startsAtUtc)),
                end: new Intl.DateTimeFormat('en-GB', {
                  timeZone: data.timezone,
                  hour: '2-digit',
                  minute: '2-digit',
                  hourCycle: 'h23',
                }).format(new Date(item.endsAtUtc)),
                minutes: item.durationMinutes,
              })}
              onPress={() => data.onOpenOverlap?.(item)}
              style={s.gap}
            >
              <Icon name="swap" size={18} color={colors.secondary} />
              <View style={s.main}>
                <Text style={[s.small, s.strong]}>
                  {t('trainerToday.overlapDuration', {
                    duration:
                      item.durationMinutes % 60 === 0
                        ? t('trainerSchedule.hours', {
                            count: item.durationMinutes / 60,
                          })
                        : item.durationMinutes < 60
                          ? t('trainerSchedule.minutes', {
                              count: item.durationMinutes,
                            })
                          : t('trainerSchedule.hoursMinutes', {
                              hours: Math.floor(item.durationMinutes / 60),
                              minutes: item.durationMinutes % 60,
                            }),
                  })}
                </Text>
                <Text style={[s.endTime, secondary]}>
                  {t('trainerToday.overlapTime', {
                    start: new Intl.DateTimeFormat('en-GB', {
                      timeZone: data.timezone,
                      hour: '2-digit',
                      minute: '2-digit',
                      hourCycle: 'h23',
                    }).format(new Date(item.startsAtUtc)),
                    end: new Intl.DateTimeFormat('en-GB', {
                      timeZone: data.timezone,
                      hour: '2-digit',
                      minute: '2-digit',
                      hourCycle: 'h23',
                    }).format(new Date(item.endsAtUtc)),
                  })}
                </Text>
              </View>
              <Icon name="chevR" size={15} color={colors.control} />
            </Pressable>
          ),
        )}
      </>
    );
  }

  const iconButton = (name: IconName, label: string, primary = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        disabled: primary && (data?.createDisabled ?? false),
      }}
      disabled={primary && data?.createDisabled}
      onPress={primary ? () => create() : openRequests}
      style={[
        s.action,
        {
          backgroundColor: colors.surface,
          borderColor: primary ? 'transparent' : colors.border,
        },
      ]}
    >
      {primary && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: 18, overflow: 'hidden' },
          ]}
        >
          <Gradient id="today-add" start="#2e4be0" end="#2136b0" radius={18} />
        </View>
      )}
      <View>
        <Icon name={name} size={22} color={primary ? '#ffffff' : colors.ink} />
      </View>
      {!primary && (
        <Text style={s.badge}>{data || scheduling ? requestCount : 2}</Text>
      )}
    </Pressable>
  );

  const sheetPeople =
    selected === 'group'
      ? (['aliya', 'madi', 'dana'] as const)
      : selected
        ? [selected.person]
        : [];
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[s.root, { backgroundColor: colors.canvas }]}
      testID={`trainer-today-${scenario}`}
    >
      {scenario === 'loading' ? (
        <>
          <View
            style={s.skeletonHead}
            accessibilityState={{ busy: true }}
            accessibilityLabel={t('common.loading')}
          >
            <View>
              <View
                style={[s.skeletonTitle, { backgroundColor: colors.sunken }]}
              />
              <View
                style={[s.skeletonSubtitle, { backgroundColor: colors.sunken }]}
              />
            </View>
            <View
              style={[s.skeletonAction, { backgroundColor: colors.sunken }]}
            />
          </View>
          <View style={[s.skeletonLabel, { backgroundColor: colors.sunken }]} />
          <View style={[s.skeletonCard, { backgroundColor: colors.sunken }]} />
        </>
      ) : (
        <>
          <ScreenHeader
            greeting={
              data
                ? t(
                    Number(data.agenda.clock.slice(0, 2)) < 5
                      ? 'trainerToday.greetingNight'
                      : Number(data.agenda.clock.slice(0, 2)) < 12
                        ? 'trainerToday.greetingMorning'
                        : Number(data.agenda.clock.slice(0, 2)) < 18
                          ? 'trainerToday.greetingDay'
                          : 'trainerToday.greetingEvening',
                    { name: data.trainerName },
                  )
                : t('trainerToday.greeting')
            }
            title={t('trainerToday.title')}
            subtitle={
              data
                ? `${data.dateLabel} · ${data.clockLabel}`
                : `${t('trainerToday.date')} · ${t('trainerToday.clock')}`
            }
            actions={
              <View style={s.actions}>
                {data?.notificationAction}
                {iconButton(
                  'inbox',
                  data
                    ? t('trainerToday.inboxDynamic', { count: requestCount })
                    : t('trainerToday.inbox'),
                )}
                {iconButton('plus', t('trainerToday.create'), true)}
              </View>
            }
          />
          <ScrollView
            contentContainerStyle={s.body}
            showsVerticalScrollIndicator={false}
          >
            {scenario === 'offline' && (
              <View
                accessibilityRole="alert"
                style={[
                  s.notice,
                  {
                    backgroundColor:
                      scheme === 'dark' ? 'rgba(245,196,81,0.14)' : '#fff2d5',
                  },
                ]}
              >
                <Icon name="wifioff" size={20} color={colors.warning} />
                <Text style={s.noticeText}>{t('trainerToday.offline')}</Text>
              </View>
            )}
            {scenario === 'empty' ||
            (data && data.agenda.rows.length === 0) ||
            (scheduling && todaySessions.length === 0) ? (
              <View
                style={[
                  s.empty,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                {!calmMode && (
                  <View style={s.emptyArtBox}>
                    <Mascot
                      pose="sleep"
                      size={170}
                      style={s.emptyArt}

                      accessible={false}
                    />
                  </View>
                )}
                <Text style={s.emptyTitle}>{t('trainerToday.emptyTitle')}</Text>
                <Text style={[s.emptyDescription, secondary]}>
                  {t('trainerToday.emptyDescription')}
                </Text>
                <Button
                  label={t('trainerToday.add')}
                  disabled={data?.createDisabled}
                  onPress={() => create()}
                  compact
                  icon={<Icon name="plus" size={18} color="#ffffff" />}
                  style={s.emptyButton}
                />
              </View>
            ) : (
              <>
                <MotionView
                  style={s.buddy}
                  accessibilityLabel={t('trainerToday.summary')}
                >
                  <Gradient
                    id="today-buddy"
                    radius={24}
                    start={scheme === 'dark' ? '#26272e' : '#262b45'}
                    end={scheme === 'dark' ? '#18191d' : '#141726'}
                  />
                  <View style={s.buddyGlowTop}>
                    <Glow
                      id="buddy-top-glow"
                      color="#5b74f0"
                      opacity={0.45}
                      radius={90}
                    />
                  </View>
                  <View style={s.buddyGlowBottom}>
                    <Glow
                      id="buddy-bottom-glow"
                      color="#ffb23d"
                      opacity={0.35}
                      radius={60}
                    />
                  </View>
                  {!calmMode && (
                    <View style={s.face}>
                      <Mascot
                        pose="calm"
                        size={58}
                        style={s.faceImage}

                        accessible={false}
                      />
                    </View>
                  )}
                  <View style={s.main}>
                    <Text style={s.buddyLine}>
                      {changed
                        ? currentCount
                          ? t('trainerToday.ongoingCount', {
                              count: currentCount,
                            })
                          : futureCount === 0
                            ? t('trainerToday.done')
                            : t(
                                pastCount === 0
                                  ? 'trainerToday.aheadCount'
                                  : 'trainerToday.leftCount',
                                { count: futureCount },
                              )
                        : t('trainerToday.ongoing')}
                    </Text>
                    <View
                      style={s.bar}
                      accessibilityRole="image"
                      accessibilityLabel={
                        changed
                          ? t('trainerToday.progressCount', {
                              done: pastCount,
                              total: totalCount,
                            })
                          : t('trainerToday.progress')
                      }
                    >
                      <View
                        style={[
                          s.progress,
                          changed && {
                            width: `${Math.round((pastCount / Math.max(1, totalCount)) * 100)}%`,
                          },
                        ]}
                      >
                        <Gradient
                          id="today-progress"
                          radius={99}
                          start="#a5b4fc"
                          end="#5b74f0"
                        />
                      </View>
                    </View>
                    <View style={s.stats}>
                      {(
                        [
                          [changed ? String(pastCount) : '5', 'behind'],
                          [changed ? String(futureCount) : '1', 'ahead'],
                          [changed ? String(currentCount) : '1', 'now'],
                        ] as const
                      ).map(([number, key]) => (
                        <Text key={key} style={s.stat}>
                          <Text style={s.statNumber}>{number}</Text>{' '}
                          {t(`trainerToday.${key}`)}
                        </Text>
                      ))}
                      <Pressable
                        accessibilityRole="button"
                        onPress={openRequests}
                        style={s.requests}
                      >
                        <Text style={s.requestText}>
                          {data || scheduling
                            ? t('trainerToday.requestsCount', {
                                count: requestCount,
                              })
                            : t('trainerToday.requests')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </MotionView>
                <View style={s.section}>
                  <View style={s.sectionHead}>
                    <Text style={[s.small, s.strong]}>
                      {t('trainerToday.plan')}
                    </Text>
                    <Text style={[s.small, s.strong, secondary]}>
                      {changed
                        ? t('trainerSchedule.sessions', {
                            count: totalCount,
                          })
                        : t('trainerToday.count')}
                    </Text>
                  </View>
                  <View
                    style={[
                      s.agenda,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {data ? (
                      controlledAgenda()
                    ) : changed ? (
                      liveAgenda()
                    ) : (
                      <>
                        <View style={s.past}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ expanded: pastOpen }}
                            onPress={() => setPastOpen(!pastOpen)}
                            style={s.toggle}
                          >
                            <Icon
                              name="check"
                              size={16}
                              color={colors.success}
                              strokeWidth={2.4}
                            />
                            <Text style={[s.pastLabel, secondary]}>
                              {t('trainerToday.past')}
                            </Text>
                            <Text style={[s.small, s.strong, accent]}>
                              {t(
                                pastOpen
                                  ? 'trainerToday.hide'
                                  : 'trainerToday.show',
                              )}
                            </Text>
                          </Pressable>
                          {pastOpen &&
                            demoPastSessions.map((session) =>
                              sessionEntry(session, true),
                            )}
                        </View>
                        <View style={[s.entry, { borderTopColor: hair }]}>
                          <Gradient
                            id="today-active"
                            start={scheme === 'dark' ? '#6f86ff' : '#2b48d6'}
                            end="#000000"
                            startOpacity={0.06}
                            endOpacity={0}
                          />
                          <View
                            style={[
                              s.activeStripe,
                              { backgroundColor: colors.accent },
                            ]}
                          />
                          <View style={s.caption}>
                            <Text style={[s.small, secondary]}>
                              {t('trainerToday.happening')}
                            </Text>
                            <Text
                              style={[
                                s.small,
                                s.strong,
                                { color: colors.accent },
                              ]}
                            >
                              {t('trainerToday.until', { time: '21:00' })}
                            </Text>
                          </View>
                          <View style={s.row}>
                            <Time start="20:00" end="21:00" expanded />
                            <View style={s.main}>
                              <Text style={s.name}>
                                {t('trainerToday.miniGroup')}
                              </Text>
                              <View style={s.program}>
                                <Text style={[s.programText, s.strong]}>
                                  {t('trainerToday.groupNames')}
                                </Text>
                              </View>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={t(
                                  'trainerToday.participants',
                                )}
                                onPress={() => select('group')}
                                style={s.rsvp}
                              >
                                <View style={s.rsvpItems}>
                                  {(
                                    [
                                      ['check', colors.success],
                                      ['clock', colors.warning],
                                      ['close', colors.control],
                                    ] as const
                                  ).map(([name, color]) => (
                                    <View key={name} style={s.rsvpItem}>
                                      <Icon
                                        name={name}
                                        color={color}
                                        size={14}
                                        strokeWidth={2.4}
                                      />
                                      <Text
                                        style={[s.small, s.strong, secondary]}
                                      >
                                        {1}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                                <Icon
                                  name="chevR"
                                  size={15}
                                  color={colors.control}
                                />
                              </Pressable>
                            </View>
                          </View>
                          {journal.status('s6') && (
                            <StatusPill label={journal.status('s6')!} />
                          )}
                          {!(
                            journal.draft('s6') &&
                            journal.dockSessionId === 's6'
                          ) && (
                            <Button
                              label={
                                journal.draft('s6')
                                  ? t('trainerToday.openJournal', {
                                      name: t('trainerToday.miniGroup'),
                                    })
                                  : journal.label('s6')
                              }
                              variant={journal.draft('s6') ? 'soft' : 'primary'}
                              icon={
                                <Icon
                                  name="play"
                                  color="#ffffff"
                                  size={20}
                                  strokeWidth={2.4}
                                />
                              }
                              onPress={() =>
                                router.push({
                                  pathname: '/session/[id]',
                                  params: { id: 's6' },
                                })
                              }
                              style={s.cta}
                            />
                          )}
                        </View>
                        <Pressable
                          onPress={() => create('21:00')}
                          accessibilityRole="button"
                          style={[s.gap, { borderTopColor: colors.border }]}
                        >
                          <View
                            style={[
                              s.gapBorder,
                              { borderColor: colors.border },
                            ]}
                          />
                          <View style={s.time}>
                            <Text style={[s.gapTime, secondary]}>
                              {t('trainerToday.freeStart')}
                            </Text>
                            <Text style={[s.endTime, secondary]}>
                              {t('trainerToday.until', { time: '21:15' })}
                            </Text>
                          </View>
                          <View style={s.main}>
                            <Text style={[s.small, s.strong]}>
                              {t('trainerToday.free')}
                            </Text>
                            <Text style={[s.endTime, secondary]}>
                              {t('trainerToday.add')}
                            </Text>
                          </View>
                          <Icon
                            name="plus"
                            size={19}
                            color={colors.secondary}
                          />
                        </Pressable>
                        {sessionEntry(demoLastSession)}
                      </>
                    )}
                  </View>
                  {(!data || data.agenda.endTime !== null) && (
                    <Text style={[s.dayEnd, secondary]}>
                      {changed
                        ? t('trainerToday.endTime', {
                            time: data
                              ? (data.agenda.endTime ?? '')
                              : todaySessions.reduce(
                                  (end, session) =>
                                    session.end > end ? session.end : end,
                                  '',
                                ),
                          })
                        : t('trainerToday.end')}
                    </Text>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </>
      )}
      {data ? null : scheduling ? (
        <SchedulingSessionSheet
          sessionId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      ) : (
        <Sheet
          open={selected !== null}
          onClose={() => setSelected(null)}
          title={
            selected === 'group'
              ? t('trainerToday.miniGroup')
              : selected
                ? t(`trainerToday.sessionTitles.${selected.title}`)
                : ''
          }
        >
          <Text style={secondary}>
            {t('trainerToday.sessionTime', {
              date: t('trainerToday.date'),
              time:
                selected === 'group'
                  ? '20:00–21:00'
                  : selected
                    ? `${selected.start}–${selected.end}`
                    : '',
            })}
          </Text>
          <Text style={s.strong}>{t('trainerToday.attendance')}</Text>
          {sheetPeople.map((person) => (
            <View key={person} className="gap-2">
              <Text style={s.strong}>
                {t(`trainerToday.people.${person}Full`)}
              </Text>
              <Text style={[s.small, secondary]}>
                {t('trainerToday.unmarked')}
              </Text>
              <View style={s.actions}>
                <Button
                  label={t('trainerToday.present')}
                  variant="soft"
                  compact
                  disabled
                />
                <Button
                  label={t('trainerToday.absent')}
                  variant="ghost"
                  compact
                  disabled
                />
              </View>
            </View>
          ))}
          <Button
            label={journal.label(
              selected === 'group' ? 's6' : (selected?.id ?? ''),
            )}
            onPress={() => {
              if (!selected) return;
              const id = selected === 'group' ? 's6' : selected.id;
              setSelected(null);
              router.push({ pathname: '/session/[id]', params: { id } });
            }}
          />
          <Button label={t('trainerToday.move')} variant="soft" disabled />
          <Button label={t('trainerToday.cancel')} variant="ghost" disabled />
          <Text style={[s.small, secondary]}>
            {t('trainerToday.attendanceHelp')}
          </Text>
        </Sheet>
      )}
    </SafeAreaView>
  );
}

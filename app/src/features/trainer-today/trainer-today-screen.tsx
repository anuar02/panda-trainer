import { useTabBarLayout } from '@/features/navigation/tab-bar-layout';
import {
  MotionHeader,
  MotionGroup,
  Shimmer,
  MotionScrollView as ScrollView,
  MotionPressable as Pressable,
} from '@/ui/motion';
import { Mascot } from '@/ui/mascot';
import { useState, type ReactNode } from 'react';
import type {
  TrainerTodayAgenda,
  TrainerTodaySessionRow,
  TrainerTodayAgendaItem,
} from '@/features/workspace-scheduling/today-adapter';
import { router } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { GradientBackground } from '@/ui/gradient-background';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useTheme, tokens } from '@/ui/theme';
import { parity } from '@/ui/parity-tokens';
import { type DemoSession, type TodayScenario } from './demo';
import { getTodayStyles } from './measurements';
import { useCalmMode } from '@/ui/calm-mode';
import {
  useJournalLabels,
  useOptionalWorkoutDemo,
} from '@/features/workout-demo';
import { workoutProgress, workoutExercises } from '@/domain/workout';
import {
  useOptionalTemplates,
  builtInTemplates,
} from '@/features/template-editor/provider';
import {
  createSchedulingState,
  schedulingToday,
  schedulingNow,
} from '@/domain/scheduling';
import { useOptionalSchedulingDemo } from '@/features/scheduling-demo/provider';
import { SchedulingSessionSheet } from '@/features/scheduling-demo/session-sheet';

export type TrainerTodayData = {
  trainerName: string;
  timezone: string;
  onOpenOverlap?: (
    overlap: Extract<TrainerTodayAgendaItem, { kind: 'overlap' }>,
  ) => void;
  dateLabel: string;
  clockLabel: string;
  agenda: TrainerTodayAgenda;
  onSelectSession: (session: TrainerTodaySessionRow) => void;
  onSelectRequest?: (id: string) => void;
  onCreate: (date: string, start?: string) => void;
  onOpenRequests: () => void;
  createDisabled?: boolean;
};

type CalmSession = {
  id: string;
  start: string;
  end: string;
  name: string;
  program: string | null;
  group: boolean;
  cancelled: boolean;
  pending: boolean;
  past: boolean;
  participants: {
    id: string;
    name: string;
    status: 'confirmed' | 'pending' | 'cancelled';
  }[];
  open: () => void;
};
const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export function TrainerTodayScreen({
  scenario = 'normal',
  data,
}: {
  scenario?: TodayScenario;
  data?: TrainerTodayData;
}) {
  const { bottomInset } = useTabBarLayout();
  const { fontScale, width } = useWindowDimensions();
  const s = getTodayStyles(fontScale, width);
  const calmMode = useCalmMode();
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const [pastOpen, setPastOpen] = useState(false);
  const [selected, setSelected] = useState<DemoSession | 'group' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const journal = useJournalLabels();
  const workout = useOptionalWorkoutDemo();
  const templates = useOptionalTemplates()?.templates ?? builtInTemplates;
  const programName = (program: string | null) =>
    templates.find((template) => template.id === program)?.name ?? program;
  const programPreview = (program: string | null) => {
    const name = programName(program);
    const template = templates.find((item) => item.id === program);
    const exercises = template?.exercises ?? workoutExercises(name);
    if (!exercises.length) return name;
    return t('trainerToday.programPreview', {
      name,
      exercises: exercises
        .slice(0, 3)
        .map((item) => item.name)
        .join(', '),
      more:
        exercises.length > 3
          ? t('trainerToday.moreExercises', { count: exercises.length - 3 })
          : '',
    });
  };
  const schedulingContext = useOptionalSchedulingDemo();
  const scheduling = data ? null : schedulingContext;
  const state = scheduling?.state ?? createSchedulingState();
  const pending = Object.values(state.requests).filter(
    (request) =>
      request.awaiting === 'trainer' &&
      (request.state === 'pending' || request.state === 'counter'),
  );
  const secondary = { color: colors.secondary };
  const hair = scheme === 'dark' ? '#212227' : '#efefeb';
  const borderButton = scheme === 'dark' ? '#3a3b42' : '#c9cad0';
  const person = (id: string) =>
    t(`trainerClients.people.${id as 'c1'}.name`).split(' ')[0] ?? '';
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
  const fromServer = (session: TrainerTodaySessionRow): CalmSession => ({
    id: session.id,
    start: session.start,
    end: session.end,
    name: session.name,
    program: session.programName,
    group: session.groupSessionId !== null,
    cancelled: session.cancelled,
    pending:
      session.replies.pending > 0 || session.pendingProposalIds.length > 0,
    past: session.past && !journal.draft(session.id),
    participants: session.participants,
    open: () => data?.onSelectSession(session),
  });
  const rows: CalmSession[] = data
    ? data.agenda.rows.map(fromServer)
    : state.sessions
        .filter((session) => session.date === schedulingToday)
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((session) => ({
          id: session.id,
          start: session.start,
          end: session.end,
          name:
            session.kind === 'group'
              ? session.title
              : session.clientId
                ? person(session.clientId)
                : session.title,
          program: programPreview(session.program),
          group: session.kind === 'group',
          cancelled: session.status === 'cancelled',
          pending: session.status === 'proposed',
          past:
            (session.status === 'cancelled' || session.end <= schedulingNow) &&
            !journal.draft(session.id) &&
            !pending.some((request) => request.sessionId === session.id),
          participants: session.participants.map((p) => ({
            id: p.clientId,
            name: person(p.clientId),
            status: p.reply,
          })),
          open: () =>
            scheduling
              ? setSelectedId(session.id)
              : session.kind === 'group'
                ? setSelected('group')
                : router.push({
                    pathname: '/session/[id]',
                    params: { id: session.id },
                  }),
        }));
  const clock = data?.agenda.clock ?? schedulingNow;
  const live = rows.filter(
    (row) =>
      !row.cancelled &&
      journal.status(row.id) !== t('trainerToday.journalFinished'),
  );
  const focus = data
    ? data.agenda.focusRow
      ? fromServer(data.agenda.focusRow)
      : undefined
    : (live.find((row) => row.start <= clock && row.end > clock) ??
      live.find((row) => row.start > clock));
  const active = data
    ? data.agenda.focusRow?.role === 'now'
    : focus !== undefined && focus.start <= clock && focus.end > clock;
  const past = rows.filter((row) => row.past && row.id !== focus?.id);
  const upcoming = rows.filter((row) => !row.past && row.id !== focus?.id);
  const requestCount = data?.agenda.pendingRequestCount ?? pending.length;
  const day = (value: string) =>
    new Intl.DateTimeFormat('ru', { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(`${value}T12:00:00Z`),
    );
  const focusJournal = focus ? workout?.state.sessions[focus.id] : undefined;
  const progress = focusJournal
    ? Object.keys(focusJournal.plans).reduce(
        (result, id) => {
          const value = workoutProgress(focusJournal, id);
          return {
            done: result.done + value.done,
            total: result.total + value.total,
          };
        },
        { done: 0, total: 0 },
      )
    : null;
  const duration = (count: number) =>
    count >= 60
      ? count % 60
        ? t('trainerSchedule.hoursMinutes', {
            hours: Math.floor(count / 60),
            minutes: count % 60,
          })
        : t('trainerSchedule.hours', { count: count / 60 })
      : t('trainerToday.durationMinutes', { count });
  const flags = (row: CalmSession) =>
    row.cancelled ||
    row.pending ||
    journal.status(row.id) ||
    pending.some((request) => request.sessionId === row.id) ? (
      <View style={c.flags}>
        {row.cancelled && (
          <Text style={[c.flag, secondary]}>{t('trainerToday.cancelled')}</Text>
        )}
        {!row.cancelled &&
        (data?.agenda.rows.find((item) => item.id === row.id)
          ?.pendingProposalIds.length ||
          pending.some((request) => request.sessionId === row.id)) ? (
          <Text style={[c.flag, { color: colors.warning }]}>
            {t('schedulingDemo.awaiting')}
          </Text>
        ) : (
          !row.cancelled &&
          row.pending && (
            <Text style={[c.flag, { color: colors.warning }]}>
              {t('trainerToday.consentPending')}
            </Text>
          )
        )}
        {journal.status(row.id) && (
          <Text style={[c.flag, secondary]}>{journal.status(row.id)}</Text>
        )}
      </View>
    ) : null;
  const entry = (row: CalmSession) => (
    <View key={row.id} testID={`today-session-${row.id}`} style={c.row}>
      <View style={c.timeColumn}>
        <Text
          style={[
            c.rowTime,
            row.cancelled && secondary,
            row.cancelled && c.struck,
          ]}
        >
          {row.start}
        </Text>
        <Text style={[c.rowEnd, secondary]}>{row.end}</Text>
      </View>
      <View style={[c.rail, { borderLeftColor: hair }]}>
        <View
          style={[
            c.dot,
            { backgroundColor: colors.canvas, borderColor: borderButton },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('trainerToday.sessionLabel', {
            name: row.name,
            start: row.start,
            end: row.end,
          })}
          onPress={row.open}
        >
          <Text
            style={[
              c.rowName,
              row.cancelled && secondary,
              row.cancelled && c.struck,
            ]}
          >
            {row.name}
          </Text>
        </Pressable>
        <Text style={[c.meta, secondary]}>
          {row.group
            ? (['confirmed', 'pending', 'cancelled'] as const)
                .map((status) => {
                  const count = row.participants.filter(
                    (person) => person.status === status,
                  ).length;
                  return count
                    ? t(
                        status === 'confirmed'
                          ? 'trainerToday.groupConfirmed'
                          : status === 'pending'
                            ? 'trainerToday.groupWaiting'
                            : 'trainerToday.groupCancelled',
                        { count },
                      )
                    : '';
                })
                .filter(Boolean)
                .join(' · ')
            : (row.program ?? t('trainerToday.noProgram'))}
        </Text>
        {flags(row)}
      </View>
    </View>
  );
  const gap = (start: string, end: string) => (
    <Pressable
      key={`gap-${start}-${end}`}
      accessibilityRole="button"
      onPress={() => create(start)}
      disabled={data?.createDisabled}
      style={c.gap}
    >
      <Text style={[c.gapTime, secondary]}>{start}</Text>
      <View style={[c.gapRail, { borderLeftColor: colors.border }]}>
        <Text style={[c.gapText, secondary]}>
          {t('trainerSchedule.free', {
            duration: duration(minutes(end) - minutes(start)),
          })}
        </Text>
      </View>
      <Icon name="plus" size={19} color={colors.secondary} />
    </Pressable>
  );
  const timeline: ReactNode[] = [];
  let cursor = focus?.end;
  if (data) {
    data.agenda.items.forEach((item, index) => {
      if (item.kind === 'session') {
        if (
          item.row.id !== focus?.id &&
          !past.some((row) => row.id === item.row.id)
        )
          timeline.push(entry(fromServer(item.row)));
      } else if (item.kind === 'gap') timeline.push(gap(item.start, item.end));
      else
        timeline.push(
          <Pressable
            key={`overlap-${index}`}
            accessibilityRole="button"
            onPress={() => data.onOpenOverlap?.(item)}
            disabled={!data.onOpenOverlap}
            style={c.overlap}
          >
            <Icon name="swap" size={16} color={colors.secondary} />
            <Text style={[c.meta, secondary]}>
              {t('trainerToday.overlapDuration', {
                duration: t('trainerToday.durationMinutes', {
                  count: item.durationMinutes,
                }),
              })}
            </Text>
          </Pressable>,
        );
    });
  } else
    upcoming.forEach((row) => {
      if (cursor && row.start > cursor) timeline.push(gap(cursor, row.start));
      if (cursor && row.start < cursor && !row.cancelled)
        timeline.push(
          <Pressable
            key={`overlap-${row.id}`}
            accessibilityRole="button"
            onPress={row.open}
            style={c.overlap}
          >
            <Icon name="swap" size={16} color={colors.secondary} />
            <Text style={[c.meta, secondary]}>
              {t('trainerToday.overlapDuration', {
                duration: t('trainerToday.durationMinutes', {
                  count: minutes(cursor) - minutes(row.start),
                }),
              })}
            </Text>
          </Pressable>,
        );
      timeline.push(entry(row));
      if (!row.cancelled && (!cursor || row.end > cursor)) cursor = row.end;
    });
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
        <View
          accessibilityState={{ busy: true }}
          accessibilityLabel={t('common.loading')}
        >
          <View style={s.skeletonHead}>
            <View>
              <Shimmer
                style={[s.skeletonTitle, { backgroundColor: colors.sunken }]}
              />
              <Shimmer
                style={[s.skeletonSubtitle, { backgroundColor: colors.sunken }]}
              />
            </View>
            <View style={s.actions}>
              <Shimmer
                style={[s.skeletonAction, { backgroundColor: colors.sunken }]}
              />
              <Shimmer
                style={[s.skeletonAction, { backgroundColor: colors.sunken }]}
              />
            </View>
          </View>
          <Shimmer
            style={[s.skeletonLabel, { backgroundColor: colors.sunken }]}
          />
          <Shimmer
            style={[s.skeletonCard, { backgroundColor: colors.sunken }]}
          />
        </View>
      ) : (
        <>
          <MotionHeader style={c.header}>
            <View style={c.headerMain}>
              <Text style={[c.date, secondary]}>
                {data?.dateLabel ?? t('trainerToday.date')}
              </Text>
              <Text accessibilityRole="header" style={c.title}>
                {t('trainerToday.title')}
              </Text>
            </View>
            <View style={c.actions}>
              <Pressable
                motionKind="inbox"
                accessibilityRole="button"
                accessibilityLabel={t(
                  requestCount > 0
                    ? 'trainerToday.inboxDynamic'
                    : 'trainerToday.inboxEmpty',
                  { count: requestCount },
                )}
                onPress={openRequests}
                style={[
                  c.action,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Icon name="inbox" size={22} color={colors.ink} />
                {requestCount > 0 && (
                  <Text
                    testID="today-inbox-count"
                    style={[
                      c.badge,
                      {
                        backgroundColor:
                          scheme === 'dark' ? '#f5c451' : '#ffb23d',
                        boxShadow: `0 0 0 2px ${colors.canvas}`,
                      },
                    ]}
                  >
                    {requestCount}
                  </Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('trainerToday.create')}
                onPress={() => create()}
                disabled={data?.createDisabled}
                style={[
                  c.action,
                  {
                    backgroundColor: colors.accent,
                    borderColor: 'transparent',
                    boxShadow: parity.button.shadow,
                    overflow: 'hidden',
                  },
                ]}
              >
                <GradientBackground
                  start={parity.button.gradientStart}
                  end={parity.button.gradientEnd}
                  radius={18}
                />
                <View style={{ position: 'relative', zIndex: 1 }}>
                  <Icon
                    name="plus"
                    size={22}
                    strokeWidth={2.2}
                    color="#ffffff"
                  />
                </View>
              </Pressable>
            </View>
          </MotionHeader>
          <ScrollView
            motionKey={scenario}
            contentContainerStyle={{ paddingBottom: bottomInset }}
            showsVerticalScrollIndicator={false}
          >
            {scenario === 'offline' && (
              <View
                key="offline"
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
            {scenario === 'empty' || rows.length === 0 ? (
              <View
                key="empty"
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
                      clipPlace="empty"
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
                {focus && (
                  <View
                    key="focus"
                    testID={`today-session-${focus.id}`}
                    style={[
                      c.focus,
                      {
                        backgroundColor: colors.surface,
                        boxShadow: parity[scheme].cardShadow,
                      },
                    ]}
                  >
                    <View style={c.eyebrowRow}>
                      <View
                        style={[
                          c.eyebrowDot,
                          {
                            backgroundColor: active
                              ? scheme === 'dark'
                                ? '#ff7a52'
                                : '#bc5a3c'
                              : colors.accent,
                          },
                        ]}
                      />
                      <Text
                        style={[
                          c.eyebrow,
                          {
                            color: active
                              ? scheme === 'dark'
                                ? '#ff7a52'
                                : '#bc5a3c'
                              : scheme === 'dark'
                                ? '#8c9eff'
                                : colors.accent,
                          },
                        ]}
                      >
                        {t(
                          active
                            ? 'trainerToday.calmNow'
                            : 'trainerToday.calmNext',
                          {
                            duration: duration(
                              Math.max(
                                0,
                                minutes(active ? focus.end : focus.start) -
                                  minutes(clock),
                              ),
                            ),
                          },
                        )}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('trainerToday.sessionLabel', {
                        name: focus.name,
                        start: focus.start,
                        end: focus.end,
                      })}
                      onPress={focus.open}
                      style={c.focusOpen}
                    >
                      <Text style={c.focusTime}>
                        {focus.start}
                        <Text
                          style={[c.focusEnd, secondary]}
                        >{` – ${focus.end}`}</Text>
                      </Text>
                      <Text style={c.focusName}>{focus.name}</Text>
                    </Pressable>
                    {focus.group ? (
                      <View style={c.people}>
                        {focus.participants.map((p) => (
                          <View
                            key={p.id}
                            accessibilityLabel={`${p.name}, ${t(p.status === 'confirmed' ? 'trainerToday.participantConfirmed' : p.status === 'pending' ? 'trainerToday.participantWaiting' : 'trainerToday.participantCancelled')}`}
                            style={[
                              c.person,
                              { backgroundColor: colors.sunken },
                            ]}
                          >
                            <View
                              style={[
                                c.avatar,
                                {
                                  backgroundColor:
                                    p.status === 'confirmed'
                                      ? scheme === 'dark'
                                        ? '#3ddc97'
                                        : '#16a34a'
                                      : p.status === 'pending'
                                        ? scheme === 'dark'
                                          ? '#f5c451'
                                          : '#ffb23d'
                                        : colors.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  c.initials,
                                  {
                                    color:
                                      p.status === 'cancelled'
                                        ? colors.secondary
                                        : '#111110',
                                  },
                                ]}
                              >
                                {p.name
                                  .split(' ')
                                  .map((part) => part[0])
                                  .slice(0, 2)
                                  .join('')}
                              </Text>
                            </View>
                            <Text
                              style={[
                                c.personName,
                                p.status === 'cancelled' && c.struck,
                                p.status === 'cancelled' && secondary,
                              ]}
                            >
                              {p.name}
                              {p.status === 'pending'
                                ? t('trainerToday.participantWaiting')
                                : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={[c.focusProgram, secondary]}>
                        {focus.program ?? t('trainerToday.noProgram')}
                      </Text>
                    )}
                    {flags(focus)}
                    {progress && progress.total > 0 && (
                      <View style={c.segments}>
                        {Array.from(
                          { length: Math.min(progress.total, 60) },
                          (_, index) => (
                            <View
                              key={index}
                              style={[
                                c.segment,
                                {
                                  backgroundColor:
                                    index < progress.done
                                      ? colors.success
                                      : colors.border,
                                },
                              ]}
                            />
                          ),
                        )}
                      </View>
                    )}
                    {!(
                      journal.draft(focus.id) &&
                      journal.dockSessionId === focus.id
                    ) && (
                      <Button
                        label={
                          journal.draft(focus.id)
                            ? t('trainerToday.resumeJournal')
                            : journal.label(focus.id)
                        }
                        variant={journal.draft(focus.id) ? 'soft' : 'primary'}
                        icon={
                          <Icon
                            name="play"
                            size={20}
                            strokeWidth={2.4}
                            color={
                              journal.draft(focus.id) ? colors.ink : '#ffffff'
                            }
                          />
                        }
                        onPress={() =>
                          data
                            ? focus.open()
                            : router.push({
                                pathname: '/session/[id]',
                                params: { id: focus.id },
                              })
                        }
                        style={c.cta}
                      />
                    )}
                  </View>
                )}
                {!focus && live.length > 0 && (
                  <Text key="all-past" style={[c.label, secondary]}>
                    {t('trainerToday.allPast')}
                  </Text>
                )}
                {timeline.length > 0 && (
                  <>
                    <View key="further" style={c.sectionLabel}>
                      <Text
                        accessibilityRole="header"
                        style={[c.labelText, secondary]}
                      >
                        {t('trainerToday.further')}
                      </Text>
                      <Text style={[c.labelText, secondary]}>
                        {t('trainerToday.until', {
                          time:
                            data?.agenda.endTime ??
                            live.reduce(
                              (last, row) => (row.end > last ? row.end : last),
                              '',
                            ),
                        })}
                      </Text>
                    </View>
                    <MotionGroup
                      key="timeline"
                      kind="agenda"
                      style={c.timeline}
                    >
                      {[
                        ...timeline,
                        <Text
                          key="free-after"
                          style={[
                            c.freeAfter,
                            secondary,
                            { borderLeftColor: colors.border },
                          ]}
                        >
                          {t('trainerToday.freeAfter')}
                        </Text>,
                      ]}
                    </MotionGroup>
                  </>
                )}
              </>
            )}
            {requestCount > 0 && (
              <View key="replies" testID="today-replies">
                <Text accessibilityRole="header" style={[c.label, secondary]}>
                  {t('trainerToday.replyNeeded')}
                </Text>
                <MotionGroup>
                  {(data
                    ? data.agenda.requests
                    : pending.map((request) => ({
                        id: request.id,
                        sessionId: request.sessionId,
                        name: person(request.clientId),
                        fromDate: request.from.date,
                        fromStart: request.from.start,
                        toDate: (request.counter ?? request.to).date,
                        toStart: (request.counter ?? request.to).start,
                      }))
                  ).map((request) => (
                    <Pressable
                      key={request.id}
                      testID={`today-request-${request.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('trainerToday.moveKind')[0]?.toUpperCase()}${t('trainerToday.moveKind').slice(1)}: ${request.name}, ${day(request.fromDate)} ${request.fromStart} → ${day(request.toDate)} ${request.toStart}. ${t('trainerToday.reply')}`}
                      onPress={() =>
                        data
                          ? data.onSelectRequest?.(request.id)
                          : scheduling
                            ? setSelectedId(request.sessionId)
                            : router.push('/inbox')
                      }
                      style={[c.reply, { borderBottomColor: hair }]}
                    >
                      <View style={c.replyWhen}>
                        <Text style={c.replyDay}>{day(request.fromDate)}</Text>
                        <Text style={[c.replySmall, secondary]}>
                          {t('trainerToday.moveKind')}
                        </Text>
                      </View>
                      <View style={c.replyMain}>
                        <Text style={c.rowName}>{request.name}</Text>
                        <Text
                          style={[c.replySmall, secondary]}
                        >{`${day(request.fromDate)} ${request.fromStart} → ${day(request.toDate)} ${request.toStart}`}</Text>
                      </View>
                      <Text
                        style={[
                          c.replyCta,
                          { color: scheme === 'dark' ? '#f5c451' : '#93620a' },
                        ]}
                      >
                        {t('trainerToday.reply')}
                      </Text>
                    </Pressable>
                  ))}
                </MotionGroup>
              </View>
            )}
            {past.length > 0 && (
              <View key="past" style={c.past}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: pastOpen }}
                  onPress={() => setPastOpen(!pastOpen)}
                  style={c.pastToggle}
                >
                  <Icon name="check" size={16} color={colors.success} />
                  <Text style={[c.pastLabel, secondary]}>
                    {past.some((row) => !row.cancelled)
                      ? t('trainerToday.pastCount', {
                          count: past.filter((row) => !row.cancelled).length,
                        })
                      : t('trainerToday.noPast')}
                    {past.some((row) => row.cancelled)
                      ? t('trainerToday.cancellations', {
                          count: past.filter((row) => row.cancelled).length,
                        })
                      : ''}
                  </Text>
                  <Text
                    style={[
                      c.replySmall,
                      { color: parity[scheme].accent.color },
                    ]}
                  >
                    {t(pastOpen ? 'trainerToday.hide' : 'trainerToday.show')}
                  </Text>
                </Pressable>
                {pastOpen && (
                  <MotionGroup key="timeline" kind="agenda" style={c.timeline}>
                    {past.map(entry)}
                  </MotionGroup>
                )}
              </View>
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

export const calmStyles = StyleSheet.create({
  segments: { flexDirection: 'row', gap: 3, marginTop: 10 },
  segment: { height: 4, flex: 1, borderRadius: 3 },
  header: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerMain: { flex: 1 },
  date: {
    fontSize: 13,
    fontFamily: tokens.font.medium,
    lineHeight: 18.85,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontFamily: tokens.font.heading,
    lineHeight: 29.4,
    letterSpacing: -0.5,
  },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    width: 44,
    height: 44,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -4,
    top: -4,
    backgroundColor: '#f5c451',
    color: '#111110',
    fontFamily: tokens.font.extraBold,
    fontSize: 14,
    lineHeight: 20.3,
    minWidth: 19,
    minHeight: 19,
    borderRadius: 9999,
    textAlign: 'center',
    paddingHorizontal: 5,
  },
  focus: { marginHorizontal: 16, padding: 18, borderRadius: 28 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrowDot: { width: 7, height: 7, borderRadius: 4 },
  eyebrow: {
    lineHeight: 18.85,
    fontSize: 13,
    fontFamily: tokens.font.strong,
    flexShrink: 1,
  },
  focusOpen: { marginTop: 10 },
  focusTime: {
    fontSize: 38,
    fontFamily: tokens.font.heading,
    lineHeight: 38,
    letterSpacing: -1,
    flexWrap: 'wrap',
  },
  focusEnd: {
    fontSize: 20,
    fontFamily: 'Montserrat_600SemiBold',
    lineHeight: 20,
    letterSpacing: -0.4,
  },
  focusName: {
    fontSize: 20,
    fontFamily: tokens.font.bold,
    lineHeight: 29,
    letterSpacing: -0.3,
    marginTop: 10,
  },
  focusProgram: { lineHeight: 20.3, fontSize: 14, marginTop: 6 },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 32,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 11,
    borderRadius: 99,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { lineHeight: 15.95, fontSize: 11, fontFamily: tokens.font.bold },
  personName: {
    lineHeight: 20.3,
    fontSize: 14,
    fontFamily: tokens.font.strong,
    flexShrink: 1,
  },
  struck: { textDecorationLine: 'line-through' },
  cta: { marginTop: 14 },
  flags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
    marginTop: 4,
  },
  flag: { lineHeight: 18.85, fontSize: 13, fontFamily: tokens.font.strong },
  label: {
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 6,
    fontSize: 13,
    lineHeight: 18.85,
    fontFamily: tokens.font.strong,
  },
  sectionLabel: {
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelText: {
    fontSize: 13,
    lineHeight: 18.85,
    fontFamily: tokens.font.strong,
  },
  timeline: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', gap: 12 },
  timeColumn: { width: 52, paddingTop: 13, alignItems: 'flex-end' },
  rowTime: {
    fontSize: 16,
    lineHeight: 23.2,
    fontFamily: tokens.font.bold,
    letterSpacing: -0.2,
  },
  rowEnd: { lineHeight: 18.096, fontSize: 12.48, marginTop: 3 },
  rail: {
    flex: 1,
    minHeight: 58,
    paddingTop: 11,
    paddingBottom: 12,
    paddingLeft: 16,
    borderLeftWidth: 2,
  },
  dot: {
    position: 'absolute',
    left: -6,
    top: 18,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  rowName: {
    fontSize: 16.48,
    fontFamily: tokens.font.bold,
    lineHeight: 23.896,
  },
  meta: { fontSize: 14, lineHeight: 19.6, marginTop: 3 },
  gap: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 42 },
  gapText: {
    fontSize: 13.44,
    lineHeight: 19.488,
    fontFamily: tokens.font.medium,
  },
  gapTime: {
    width: 52,
    textAlign: 'right',
    fontSize: 12.48,
    lineHeight: 18.096,
    fontFamily: tokens.font.medium,
  },
  gapRail: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
  },
  overlap: {
    marginLeft: 64,
    marginVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  freeAfter: {
    marginLeft: 64,
    paddingTop: 10,
    paddingBottom: 4,
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    fontSize: 13.44,
    lineHeight: 19.488,
  },
  reply: {
    marginHorizontal: 16,
    paddingVertical: 10,
    paddingHorizontal: 2,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
  },
  replyWhen: { width: 58 },
  replyDay: { fontSize: 17, lineHeight: 24.65, fontFamily: tokens.font.bold },
  replySmall: { lineHeight: 18.85, fontSize: 13, marginTop: 2 },
  replyMain: { flex: 1 },
  replyCta: {
    lineHeight: 18.85,
    fontSize: 13,
    fontFamily: tokens.font.strong,
    flexShrink: 0,
  },
  past: { marginTop: 10 },
  pastToggle: {
    minHeight: 44,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pastLabel: {
    lineHeight: 16.9,
    fontSize: 13,
    fontFamily: tokens.font.medium,
    flex: 1,
  },
});

const c = calmStyles;

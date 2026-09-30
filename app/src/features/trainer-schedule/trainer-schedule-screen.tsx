import { router } from 'expo-router';
import { useOptionalSchedulingDemo } from '@/features/scheduling-demo/provider';
import { scheduleRows } from '@/features/scheduling-demo/adapters';
import { SchedulingSessionSheet } from '@/features/scheduling-demo/session-sheet';
import { Fragment, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { DemoScenario } from '@/features/demo/use-demo-scenario';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icons';
import { Mascot } from '@/ui/mascot';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { GradientBackground } from '@/ui/gradient-background';
import {
  agendaClusters,
  formatTime,
  minutes,
  scheduleSessions,
  scheduleToday,
  shiftDate,
  weekDates,
  type ScheduleSession,
} from './demo';
import { scheduleStyles as s } from './measurements';
import { SessionDetailsSheet } from './session-details-sheet';
import { useJournalLabels } from '@/features/workout-demo';

export function TrainerScheduleScreen({
  scenario = 'normal',
  initialDate,
}: {
  scenario?: DemoScenario;
  initialDate?: string;
}) {
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const demo = useOptionalSchedulingDemo();
  const [day, setDay] = useState(initialDate ?? scheduleToday);
  const create = (start?: string) =>
    router.push({
      pathname: '/new',
      params: { date: day, ...(start ? { start } : {}) },
    });
  const [selected, setSelected] = useState<ScheduleSession | null>(null);
  const journal = useJournalLabels();
  const loading = scenario === 'loading';
  const all =
    scenario === 'empty'
      ? []
      : demo
        ? scheduleRows(demo.state)
        : scheduleSessions;
  const sessions = all.filter((session) => session.date === day);
  const clusters = agendaClusters(sessions);
  const dates = weekDates(day);
  const secondary = { color: colors.secondary };
  const hair = scheme === 'dark' ? '#212227' : '#efefeb';
  const selectedInk = scheme === 'dark' ? '#0b0c0e' : '#ffffff';
  const selectedSecondary =
    scheme === 'dark' ? 'rgba(11,12,14,0.66)' : '#ffffff';
  const warningBackground =
    scheme === 'dark' ? 'rgba(245,196,81,0.14)' : 'rgba(255,178,61,0.2)';
  const dateValue = new Date(`${day}T12:00:00Z`);
  const capitalize = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1);
  const month = capitalize(
    new Intl.DateTimeFormat(i18n.language, {
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Almaty',
    })
      .format(dateValue)
      .replace(' г.', ''),
  );
  const fullDate = capitalize(
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Asia/Almaty',
    }).format(dateValue),
  );
  const monthNames = t('trainerSchedule.monthsShort', { returnObjects: true });
  const weekdays = t('trainerSchedule.weekdays', { returnObjects: true });
  const shortDate = (date: string) =>
    `${Number(date.slice(8))} ${monthNames[Number(date.slice(5, 7)) - 1]}`;
  const countLabel = (count: number) =>
    t('trainerSchedule.sessions', { count });
  const duration = (value: number) =>
    value % 60 === 0
      ? t('trainerSchedule.hours', { count: value / 60 })
      : value < 60
        ? t('trainerSchedule.minutes', { count: value })
        : t('trainerSchedule.hoursMinutes', {
            hours: Math.floor(value / 60),
            minutes: value % 60,
          });

  function entry(session: ScheduleSession, index: number) {
    const name =
      session.person === 'newClient' || session.person === 'aliya'
        ? (session.title ?? '')
        : t(`trainerSchedule.people.${session.person}`);
    const group = session.person === 'group';
    return (
      <View
        key={session.id}
        style={[index > 0 && s.divider, { borderTopColor: hair }]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelected(session)}
          accessibilityLabel={t('trainerSchedule.open', {
            name,
            start: session.start,
            end: session.end,
          })}
          style={s.entry}
        >
          <View style={s.time}>
            <Text style={[s.small, s.bold]}>{session.start}</Text>
            <Text style={[s.small, secondary]}>{session.end}</Text>
          </View>
          <View style={s.content}>
            <Text style={s.name}>{name}</Text>
            <Text style={[s.detail, secondary]}>
              {group
                ? session.participantIds
                  ? session.participantIds
                      .map(
                        (id) =>
                          t(`trainerClients.people.${id as 'c1'}.name`).split(
                            ' ',
                          )[0],
                      )
                      .join(', ')
                  : t('trainerSchedule.groupNames')
                : session.program
                  ? t(`trainerSchedule.programs.${session.program}`)
                  : (session.programName ?? t('trainerSchedule.noProgram'))}
            </Text>
            {group && (
              <Text style={[s.detail, secondary]}>
                {session.replies
                  ? t('schedulingDemo.groupReplies', session.replies)
                  : t('trainerSchedule.groupSummary')}
              </Text>
            )}
            {session.pending && (
              <Text style={[s.detail, secondary]}>
                {t('schedulingDemo.pending')}
              </Text>
            )}
            {journal.status(session.id) && (
              <Text style={[s.detail, secondary]}>
                {journal.status(session.id)}
              </Text>
            )}
            {!session.request && !session.pending && (
              <View style={[s.row, s.confirmed]}>
                <Icon name="check" size={12} color={colors.success} />
                <Text style={[s.detail, secondary]}>
                  {t(
                    group
                      ? 'trainerSchedule.groupConfirmed'
                      : 'trainerSchedule.confirmed',
                  )}
                </Text>
              </View>
            )}
          </View>
          <View style={s.chevron}>
            <Icon name="chevR" size={16} color={colors.secondary} />
          </View>
        </Pressable>
        {session.request && (
          <Pressable
            disabled={!demo}
            onPress={() => setSelected(session)}
            accessibilityRole="button"
            accessibilityState={{ disabled: !demo }}
            style={[s.row, s.request, { backgroundColor: warningBackground }]}
          >
            <Icon name="swap" size={15} color={colors.warning} />
            <View style={s.main}>
              <Text style={[s.small, { color: colors.warning }]}>
                {t('trainerSchedule.request')}
              </Text>
              <Text style={[s.small, s.requestDate, { color: colors.warning }]}>
                {t('trainerSchedule.proposed', {
                  date: shortDate(session.request.date),
                  time: session.request.time,
                })}
              </Text>
            </View>
            <Icon name="chevR" size={14} color={colors.warning} />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      testID={`trainer-schedule-${scenario}`}
      style={[s.root, { backgroundColor: colors.canvas }]}
    >
      <View style={s.header}>
        <Text accessibilityRole="header" style={s.title}>
          {t('trainerSchedule.title')}
        </Text>
        <Pressable
          onPress={() => create()}
          accessibilityRole="button"
          accessibilityLabel={t('trainerSchedule.addDay')}
          style={[s.iconButton, { backgroundColor: colors.ink }]}
        >
          <Icon name="plus" color={selectedInk} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.body}>
        {demo?.storageStatus === 'error' && (
          <View>
            <Text accessibilityRole="alert">
              {t('schedulingDemo.errors.storage')}
            </Text>
            <Button
              label={t('common.retry')}
              variant="soft"
              onPress={demo.retrySave}
            />
          </View>
        )}
        <Card
          flush
          style={s.nav}
          accessibilityLabel={t('trainerSchedule.dateSelection')}
        >
          <View style={[s.row, s.month]}>
            <Text accessibilityRole="header" style={s.monthTitle}>
              {month}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDay(scheduleToday)}
              style={[s.today, { backgroundColor: colors.sunken }]}
            >
              <Text style={[s.small, s.strong]}>
                {t('trainerSchedule.today')}
              </Text>
            </Pressable>
          </View>
          <View style={[s.row, s.weekNav]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('trainerSchedule.previousWeek')}
              onPress={() => setDay(shiftDate(day, -7))}
              style={s.iconButton}
            >
              <Icon name="chevL" color={colors.ink} size={20} />
            </Pressable>
            <Text
              style={[s.small, s.medium, secondary]}
            >{`${shortDate(dates[0] ?? day)} — ${shortDate(dates[6] ?? day)}`}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('trainerSchedule.nextWeek')}
              onPress={() => setDay(shiftDate(day, 7))}
              style={s.iconButton}
            >
              <Icon name="chevR" color={colors.ink} size={20} />
            </Pressable>
          </View>
          <View style={s.week}>
            {dates.map((date, index) => {
              const selected = day === date;
              const count = all.filter(
                (session) => session.date === date,
              ).length;
              const dateLabel = new Intl.DateTimeFormat(i18n.language, {
                day: 'numeric',
                month: 'long',
                timeZone: 'Asia/Almaty',
              }).format(new Date(`${date}T12:00:00Z`));
              return (
                <Pressable
                  key={date}
                  testID={`schedule-date-${date}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${dateLabel}${loading ? '' : `, ${countLabel(count)}`}`}
                  onPress={() => setDay(date)}
                  style={[s.day, selected && { backgroundColor: colors.ink }]}
                >
                  <Text
                    style={[
                      s.small,
                      s.medium,
                      {
                        color: selected ? selectedSecondary : colors.secondary,
                      },
                    ]}
                  >
                    {weekdays[index]}
                  </Text>
                  <Text
                    style={[
                      s.dayNumber,
                      { color: selected ? selectedInk : colors.ink },
                      date === scheduleToday && !selected && s.underline,
                    ]}
                  >
                    {Number(date.slice(8))}
                  </Text>
                  <Text
                    style={[
                      s.small,
                      s.strong,
                      {
                        color: selected ? selectedSecondary : colors.secondary,
                      },
                    ]}
                  >
                    {loading || !count ? '—' : count}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[s.row, s.key]}>
            <Text style={[s.small, secondary]}>
              {t('trainerSchedule.countKey')}
            </Text>
            <Text style={[s.small, secondary]}>
              {t('trainerSchedule.city')}
            </Text>
          </View>
        </Card>
        <View
          style={s.section}
          accessibilityLabel={t('trainerSchedule.selectedDay')}
        >
          <View style={s.dayHeading}>
            <Text accessibilityRole="header" style={s.dayTitle}>
              {fullDate}
            </Text>
            <Text style={[s.small, s.subtitle, secondary]}>
              {loading
                ? t('trainerSchedule.loading')
                : sessions.length
                  ? t('trainerSchedule.total', {
                      sessions: countLabel(sessions.length),
                      duration: duration(
                        sessions.reduce(
                          (sum, session) =>
                            sum + minutes(session.end) - minutes(session.start),
                          0,
                        ),
                      ),
                    })
                  : countLabel(0)}
            </Text>
          </View>
          {scenario === 'offline' && (
            <View
              accessibilityRole="alert"
              style={[s.row, s.notice, { backgroundColor: warningBackground }]}
            >
              <Icon name="wifi" size={18} color={colors.warning} />
              <Text
                style={[s.detail, s.medium, s.main, { color: colors.warning }]}
              >
                {t('trainerSchedule.offline')}
              </Text>
            </View>
          )}
          {loading ? (
            <Card
              flush
              style={s.skeletonCard}
              accessibilityState={{ busy: true }}
              accessibilityLabel={t('trainerSchedule.loading')}
            >
              {Array.from({ length: 4 }, (_, index) => (
                <View
                  key={index}
                  style={[
                    s.skeletonRow,
                    index > 0 && s.divider,
                    { borderTopColor: hair },
                  ]}
                >
                  <View style={s.skeletonAvatar}>
                    <GradientBackground
                      start={colors.sunken}
                      end={hair}
                      radius={21}
                    />
                  </View>
                  <View style={s.main}>
                    <View style={s.skeletonLine}>
                      <GradientBackground
                        start={colors.sunken}
                        end={hair}
                        radius={10}
                      />
                    </View>
                    <View style={s.skeletonSubline}>
                      <GradientBackground
                        start={colors.sunken}
                        end={hair}
                        radius={10}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          ) : sessions.length === 0 ? (
            <Card flush style={s.empty}>
              <View style={s.emptyArt}>
                <View style={s.pandaBox}>
                  <GradientBackground
                    radials={[
                      {
                        color: '#ffb23d',
                        opacity: 0.35,
                        cx: 0.5,
                        cy: 0.5,
                        rx: 78.2,
                        ry: 78.2,
                        stop: 0.7,
                      },
                      {
                        color: '#ff7a1f',
                        opacity: 0.12,
                        cx: 0.5,
                        cy: 0.5,
                        rx: 78.2,
                        ry: 78.2,
                        stop: 0.7,
                      },
                    ]}
                  />
                  <Mascot pose="sleep" size={170} style={s.pandaImage} />
                </View>
              </View>
              <Text style={s.emptyTitle}>{t('trainerSchedule.empty')}</Text>
              <Text style={[s.emptyHint, secondary]}>
                {t('trainerSchedule.emptyHint')}
              </Text>
              <View style={s.emptyAction}>
                <Button
                  onPress={() => create()}
                  compact
                  label={t('trainerSchedule.add')}
                  icon={<Icon name="plus" size={18} color="#ffffff" />}
                  accessibilityHint={t('trainerSchedule.unavailable')}
                />
              </View>
            </Card>
          ) : (
            <Card flush style={s.agenda}>
              {clusters.map((cluster, index) => {
                const previous = clusters[index - 1];
                const first = cluster.sessions[0];
                if (!first) return null;
                return (
                  <Fragment key={first.id}>
                    {previous && cluster.start > previous.end && (
                      <Pressable
                        onPress={() => create(formatTime(previous.end))}
                        accessibilityRole="button"
                        style={[s.row, s.gap, { borderColor: colors.border }]}
                      >
                        <View style={s.gapLabels}>
                          <Text
                            style={[s.small, secondary]}
                          >{`${formatTime(previous.end)}–${formatTime(cluster.start)}`}</Text>
                          <Text style={[s.small, secondary]}>
                            {t('trainerSchedule.free', {
                              duration: duration(cluster.start - previous.end),
                            })}
                          </Text>
                        </View>
                        <Icon name="plus" size={16} color={colors.secondary} />
                      </Pressable>
                    )}
                    {cluster.sessions.length > 1 ? (
                      <View
                        style={[
                          s.overlap,
                          {
                            borderColor:
                              scheme === 'dark' ? '#f5c451' : '#ffb23d',
                          },
                        ]}
                      >
                        <View
                          style={[
                            s.row,
                            s.overlapLabel,
                            { borderBottomColor: colors.border },
                          ]}
                        >
                          <Icon name="alert" size={14} color={colors.warning} />
                          <Text style={[s.small, { color: colors.warning }]}>
                            {t('trainerSchedule.overlap', {
                              sessions: countLabel(cluster.sessions.length),
                            })}
                          </Text>
                        </View>
                        {cluster.sessions.map(entry)}
                      </View>
                    ) : (
                      entry(
                        first,
                        previous && cluster.start === previous.end ? 1 : 0,
                      )
                    )}
                  </Fragment>
                );
              })}
            </Card>
          )}
        </View>
      </ScrollView>
      {demo ? (
        <SchedulingSessionSheet
          sessionId={selected?.id ?? null}
          onClose={() => setSelected(null)}
        />
      ) : (
        <SessionDetailsSheet
          session={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </SafeAreaView>
  );
}

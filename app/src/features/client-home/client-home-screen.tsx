import {
  MotionHeader,
  Shimmer,
  GrowX,
  MotionScrollView as ScrollView,
  MotionPressable as Pressable,
} from '@/ui/motion';

import { DemoNotificationEntry } from '@/features/notifications/demo';
import {
  schedulingToday,
  schedulingNow,
  type SchedulingSession,
} from '@/domain/scheduling';
import { workoutClients, workoutExercises } from '@/domain/workout/fixtures';
import { useOptionalSchedulingDemo } from '@/features/scheduling-demo/provider';
import { SchedulingSessionSheet } from '@/features/scheduling-demo/session-sheet';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { GradientBackground } from '@/ui/gradient-background';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icons';
import { Mascot } from '@/ui/mascot';
import { Sheet } from '@/ui/sheet';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { homeBookings, homePackage, type HomeScenario } from './fixtures';
import { styles as s } from './styles';
import type { clientHome } from './ru';

export type ClientHomeBookingRow = {
  id: string;
  date: string;
  start: string;
  end: string;
  today: boolean;
  programName: string | null;
  programPreview?: string;
  group: boolean;
  status: 'proposed' | 'confirmed';
  hasProposal?: boolean;
};
export type ClientHomeData = {
  clientName: string;
  trainerName: string;
  timezone: string;
  bookings: readonly ClientHomeBookingRow[];
  loading?: boolean;
  requests?: ReactNode;
  notificationAction?: ReactNode;
  facts?: ReactNode;
  onSelectBooking: (booking: ClientHomeBookingRow) => void;
  onProgramPreview?: (booking: ClientHomeBookingRow) => void;
  onOpenHistory?: () => void;
  renderActions?: (booking: ClientHomeBookingRow) => ReactNode;
};
export function ClientHomeScreen({
  scenario = 'normal',
  data,
}: {
  scenario?: HomeScenario;
  data?: ClientHomeData;
}) {
  return data ? (
    <ControlledClientHome data={data} />
  ) : (
    <DemoClientHomeScreen scenario={scenario} />
  );
}
function DemoClientHomeScreen({
  scenario = 'normal',
}: {
  scenario?: HomeScenario;
}) {
  const { t, i18n } = useTranslation();
  const demo = useOptionalSchedulingDemo();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const fmt = (date: string, weekday = false) =>
    new Intl.DateTimeFormat(i18n.language, {
      ...(weekday ? { weekday: 'short' as const } : {}),
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Almaty',
    })
      .format(new Date(`${date}T12:00:00Z`))
      .replaceAll('.', '');
  const { colors, scheme } = useTheme();
  const hair = scheme === 'light' ? '#efefeb' : '#212227';
  const warningBackground =
    scheme === 'light' ? 'rgba(255, 178, 61, 0.2)' : 'rgba(245, 196, 81, 0.14)';
  const [cancelled, setCancelled] = useState<string[]>([]);
  const [requestActive, setRequestActive] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const sharedBookings = demo?.state.sessions
    .filter(
      (session) =>
        session.status !== 'cancelled' &&
        session.participants.some(
          (p) => p.clientId === 'c1' && p.reply !== 'cancelled',
        ) &&
        (session.date > schedulingToday ||
          (session.date === schedulingToday && session.end > schedulingNow)),
    )
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const bookings = (
    sharedBookings
      ? sharedBookings.map((session) => ({
          id: session.id,
          dateKey:
            session.date === schedulingToday
              ? ('todayDate' as const)
              : ('futureDate' as const),
          start: session.start,
          end: session.end,
          programKey: session.program
            ? ('program' as const)
            : ('onsite' as const),
          today: session.date === schedulingToday,
        }))
      : homeBookings
  ).filter((booking) => !cancelled.includes(booking.id));
  const next = bookings[0];
  const nextSession = sharedBookings?.find(
    (session) => session.id === next?.id,
  );
  const empty = scenario === 'empty' || !next;
  const activeRequest = demo
    ? Object.values(demo.state.requests).find(
        (request) =>
          request.clientId === 'c1' &&
          ['pending', 'counter'].includes(request.state),
      )
    : undefined;
  const transfer = demo
    ? Boolean(activeRequest)
    : requestActive && bookings.some((booking) => booking.id === 's8');
  const transferSessionId = activeRequest?.sessionId ?? 's8';
  const proposal = activeRequest?.counter ?? activeRequest?.to;
  const tx = (key: keyof typeof clientHome) => t(`clientHome.${key}`);
  const programPreview = (session: SchedulingSession) => {
    const participant = session.participants.find(
      (person) => person.clientId === 'c1',
    );
    const program =
      session.kind === 'group'
        ? participant?.program !== undefined
          ? participant.program
          : (workoutClients.c1?.program ?? null)
        : session.program;
    const exercises = workoutExercises(program);
    if (!exercises.length) return tx('onsite');
    return t('clientHome.programPreview', {
      program,
      exercises: exercises
        .slice(0, 3)
        .map((exercise) => exercise.name)
        .join(', '),
      more:
        exercises.length > 3
          ? t('clientHome.moreExercises', { count: exercises.length - 3 })
          : '',
    });
  };

  const requestCard = (
    <View
      style={[
        s.request,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={s.requestLabel}>
        <Icon name="swap" size={14} color={colors.warning} />
        <Text
          className="font-bold"
          style={[s.small, { color: colors.warning }]}
        >
          {tx('transfer')}
        </Text>
      </View>
      <View style={s.dates}>
        <View style={s.dateColumn}>
          <Text className="text-secondary" style={s.small}>
            {tx('current')}
          </Text>
          <Text style={s.small}>
            {activeRequest ? fmt(activeRequest.from.date) : tx('futureShort')}
          </Text>
          <Text className="font-strong" style={s.small}>
            {activeRequest
              ? `${activeRequest.from.start}–${activeRequest.from.end}`
              : tx('currentTime')}
          </Text>
        </View>
        <Icon name="arrowRight" size={18} color={colors.ink} />
        <View style={s.dateColumn}>
          <Text className="text-secondary" style={s.small}>
            {tx('proposed')}
          </Text>
          <Text style={s.small}>
            {proposal ? fmt(proposal.date) : tx('proposedDate')}
          </Text>
          <Text className="font-strong" style={s.small}>
            {proposal
              ? `${proposal.start}–${proposal.end}`
              : tx('proposedTime')}
          </Text>
        </View>
      </View>
      <Text className="text-secondary" style={s.waiting}>
        {activeRequest?.awaiting === 'client'
          ? t('schedulingDemo.unchanged', activeRequest.from)
          : tx('waiting')}
      </Text>
      <View style={s.requestAction}>
        <Button
          label={
            activeRequest?.awaiting === 'client'
              ? t('schedulingDemo.awaiting')
              : tx('withdraw')
          }
          variant="soft"
          compact
          onPress={() => {
            if (!demo || !activeRequest) {
              setRequestActive(false);
              return;
            }
            if (activeRequest.awaiting === 'client') {
              setSelectedSession(activeRequest.sessionId);
              return;
            }
            const result = demo.dispatch(
              {
                type: 'withdraw',
                requestId: activeRequest.id,
                expectedRevision: activeRequest.revision,
              },
              { role: 'client', clientId: 'c1' },
            );
            if (!result.ok)
              setActionError(t(`schedulingDemo.errors.${result.error}`));
          }}
        />
      </View>
    </View>
  );
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`client-home-${scenario}`}
    >
      <MotionHeader motionKey={scenario} style={s.topbar}>
        <View style={s.trainer}>
          <View style={s.avatar}>
            <Text style={s.initials}>{tx('initials')}</Text>
          </View>
          <View>
            <Text className="font-medium text-secondary" style={s.trainerText}>
              {tx('trainerLabel')}
            </Text>
            <Text className="font-bold" style={s.trainerText}>
              {tx('trainer')}
            </Text>
          </View>
        </View>
        <DemoNotificationEntry />
      </MotionHeader>
      <ScrollView motionKey={scenario} contentContainerStyle={s.body}>
        {actionError ? (
          <Text accessibilityRole="alert">{actionError}</Text>
        ) : null}
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
        {scenario === 'loading' ? (
          <View
            style={s.page}
            accessibilityLabel={tx('loading')}
            accessible
            accessibilityRole="progressbar"
          >
            <Card flush style={s.skeletonCard}>
              {[0, 1, 2, 3].map((row) => (
                <View
                  key={row}
                  style={[
                    s.skeletonRow,
                    row > 0 && { borderTopWidth: 1, borderTopColor: hair },
                  ]}
                >
                  <Shimmer
                    style={[
                      s.skeletonCircle,
                      { backgroundColor: colors.sunken },
                    ]}
                  />
                  <View style={s.skeletonMain}>
                    <Shimmer
                      style={[
                        s.skeletonTitle,
                        { backgroundColor: colors.sunken },
                      ]}
                    />
                    <Shimmer
                      style={[
                        s.skeletonMeta,
                        { backgroundColor: colors.sunken },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : empty ? (
          <>
            <Text accessibilityRole="header" style={s.title}>
              {tx('greeting')}
            </Text>
            <View style={s.page}>
              <View style={s.empty}>
                <Mascot
                  pose="sit"
                  size={170}
                  style={s.emptyMascot}
                  resizeMode="contain"
                  accessible={false}
                />
                <Text style={s.emptyTitle}>{tx('empty')}</Text>
                <Text className="text-secondary" style={s.emptyHint}>
                  {tx('emptyHint')}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={[s.encouragement, { color: colors.accent }]}>
              {tx(next.today ? 'encouragement' : 'soon')}
            </Text>
            <Text accessibilityRole="header" style={s.title}>
              {tx('greeting')}
            </Text>
            {scenario === 'offline' && (
              <View
                style={[s.notice, { backgroundColor: warningBackground }]}
                accessibilityRole="alert"
              >
                <Icon name="wifioff" color={colors.warning} size={18} />
                <Text style={[s.noticeText, { color: colors.warning }]}>
                  {tx('offline')}
                </Text>
              </View>
            )}
            <View style={s.page}>
              <Card flush>
                <View style={s.hero}>
                  <GradientBackground
                    radius={24}
                    radials={[
                      {
                        color: '#e0561b',
                        opacity: 0.14,
                        cx: 1.1,
                        cy: 0,
                        rx: 260,
                        ry: 200,
                        stop: 0.7,
                      },
                      {
                        color: '#ffb23d',
                        opacity: 0.22,
                        cx: 1,
                        cy: 0.3,
                        rx: 220,
                        ry: 160,
                        stop: 0.7,
                      },
                    ]}
                  />
                  <Mascot
                    pose={
                      next.id === transferSessionId && transfer
                        ? 'clipboard'
                        : 'wave'
                    }
                    size={92}
                    style={s.mascot}
                    resizeMode="contain"
                    accessible={false}
                  />
                  <View style={s.top}>
                    <Text
                      className="font-strong text-secondary"
                      style={s.small}
                    >
                      {tx(next.today ? 'today' : 'next')}
                    </Text>
                    <StatusPill
                      label={
                        nextSession?.participants.some(
                          (p) => p.clientId === 'c1' && p.reply === 'pending',
                        )
                          ? t('schedulingDemo.awaiting')
                          : tx(
                              next.id === transferSessionId && transfer
                                ? 'hasTransfer'
                                : 'confirmed',
                            )
                      }
                      tone={
                        next.id === transferSessionId && transfer
                          ? 'warning'
                          : 'success'
                      }
                    />
                  </View>
                  <Text
                    className="font-medium text-secondary"
                    style={[s.small, s.date]}
                  >
                    {nextSession
                      ? fmt(nextSession.date, true)
                      : tx(next.dateKey)}
                  </Text>
                  <Text style={s.when}>
                    {t('clientHome.timeStart', { start: next.start })}
                    <Text style={[s.when, s.end]}>{next.end}</Text>
                  </Text>
                  <View style={s.meta}>
                    <Text style={s.program}>
                      {nextSession
                        ? programPreview(nextSession)
                        : tx(next.programKey)}
                    </Text>
                    <Text className="text-secondary" style={s.small}>
                      {tx(
                        nextSession?.kind === 'group' ? 'group' : 'individual',
                      )}
                    </Text>
                  </View>
                  {next.id === transferSessionId && transfer && (
                    <View style={s.requestAction}>{requestCard}</View>
                  )}
                  <View style={s.actions}>
                    {nextSession?.participants.some(
                      (p) => p.clientId === 'c1' && p.reply === 'pending',
                    ) && (
                      <Button
                        label={t('schedulingDemo.confirm')}
                        compact
                        onPress={() => {
                          if (!demo) return;
                          const result = demo.dispatch(
                            {
                              type: 'confirm',
                              sessionId: nextSession.id,
                              expectedSessionRevision: nextSession.revision,
                            },
                            { role: 'client', clientId: 'c1' },
                          );
                          if (!result.ok)
                            setActionError(
                              t(`schedulingDemo.errors.${result.error}`),
                            );
                        }}
                      />
                    )}
                    {!(next.id === transferSessionId && transfer) && (
                      <Button
                        label={tx('propose')}
                        variant="soft"
                        compact
                        disabled={!demo}
                        onPress={() => setSelectedSession(next.id)}
                        icon={<Icon name="swap" size={18} color={colors.ink} />}
                      />
                    )}
                    <Button
                      label={tx('cancel')}
                      variant="ghost"
                      compact
                      onPress={() => setCancelOpen(true)}
                    />
                  </View>
                </View>
              </Card>
            </View>
            {transfer && next.id !== transferSessionId && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>{tx('transfers')}</Text>
                {requestCard}
              </View>
            )}
            <View style={s.packageSection}>
              <Card flush>
                <View style={s.package}>
                  <View style={s.packageHeading}>
                    <Text className="font-strong" style={s.small}>
                      {tx('balance')}
                    </Text>
                    <Text className="text-secondary" style={s.small}>
                      {tx('package')}
                    </Text>
                  </View>
                  <View style={s.value}>
                    <Text style={s.number}>{homePackage.remaining}</Text>
                    <Text className="text-secondary" style={s.small}>
                      {t('clientHome.units', { count: homePackage.bought })}
                    </Text>
                  </View>
                  <View style={[s.meter, { backgroundColor: colors.sunken }]}>
                    <GrowX
                      style={[
                        s.meterFill,
                        {
                          width: `${(homePackage.remaining / homePackage.bought) * 100}%`,
                          backgroundColor: colors.accent,
                        },
                      ]}
                    />
                  </View>
                  <View style={s.due}>
                    <StatusPill label={tx('due')} tone="warning" />
                  </View>
                </View>
              </Card>
            </View>
            {bookings.length > 1 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>{tx('upcoming')}</Text>
                <Card flush>
                  {bookings.slice(1).map((booking, index) => {
                    const session = sharedBookings?.find(
                      (value) => value.id === booking.id,
                    );
                    return (
                      <View
                        key={booking.id}
                        testID={`home-upcoming-${booking.id}`}
                        style={[
                          s.upcoming,
                          index > 0 && {
                            borderTopWidth: 1,
                            borderTopColor: hair,
                          },
                        ]}
                      >
                        <Text style={s.rowTitle}>
                          {session
                            ? t('clientHome.upcomingBooking', {
                                date: fmt(session.date),
                                start: session.start,
                              })
                            : tx('upcomingTime')}
                        </Text>
                        <Text
                          className="font-medium text-secondary"
                          style={s.rowMeta}
                        >
                          {session
                            ? t('clientHome.upcomingProgram', {
                                program: programPreview(session),
                                group:
                                  session.kind === 'group'
                                    ? tx('groupSuffix')
                                    : '',
                              })
                            : tx(booking.programKey)}
                        </Text>
                      </View>
                    );
                  })}
                </Card>
              </View>
            )}
            <View style={s.history}>
              <Button
                label={tx('history')}
                variant="soft"
                icon={<Icon name="list" color={colors.ink} size={18} />}
                onPress={() => router.push('./history')}
              />
            </View>
          </>
        )}
      </ScrollView>
      {demo && (
        <SchedulingSessionSheet
          sessionId={selectedSession}
          actor={{ role: 'client', clientId: 'c1' }}
          onClose={() => setSelectedSession(null)}
        />
      )}
      <Sheet
        open={cancelOpen}
        title={tx('cancelTitle')}
        onClose={() => setCancelOpen(false)}
      >
        {next && (
          <Text>
            {t('clientHome.bookingSummary', {
              date: nextSession
                ? fmt(nextSession.date, true)
                : tx(next.dateKey),
              start: next.start,
              end: next.end,
            })}
          </Text>
        )}
        <Text className="text-secondary">{tx('cancelHint')}</Text>
        <Button
          label={tx('cancel')}
          variant="danger"
          onPress={() => {
            if (demo && nextSession) {
              const result = demo.dispatch(
                {
                  type: 'cancel',
                  sessionId: nextSession.id,
                  expectedSessionRevision: nextSession.revision,
                },
                { role: 'client', clientId: 'c1' },
              );
              if (!result.ok) {
                setActionError(t(`schedulingDemo.errors.${result.error}`));
                return;
              }
            } else if (next) setCancelled((ids) => [...ids, next.id]);
            setCancelOpen(false);
          }}
        />
        <Button
          label={tx('keep')}
          variant="soft"
          onPress={() => setCancelOpen(false)}
        />
      </Sheet>
    </SafeAreaView>
  );
}

function ControlledClientHome({ data }: { data: ClientHomeData }) {
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const tx = (key: keyof typeof clientHome) => t(`clientHome.${key}`);
  const fmt = (date: string, weekday = false) =>
    new Intl.DateTimeFormat(i18n.language, {
      ...(weekday ? { weekday: 'short' as const } : {}),
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
      .format(new Date(`${date}T12:00:00Z`))
      .replaceAll('.', '');
  const next = data.bookings[0];
  const hair = scheme === 'light' ? '#efefeb' : '#212227';
  const preview = (row: ClientHomeBookingRow) =>
    row.programPreview ?? row.programName ?? tx('onsite');
  const initials = data.trainerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`client-home-${data.loading ? 'loading' : next ? 'normal' : 'empty'}`}
    >
      <MotionHeader style={s.topbar}>
        <View style={s.trainer}>
          <View style={s.avatar}>
            <Text style={s.initials}>{initials}</Text>
          </View>
          <View>
            <Text className="font-medium text-secondary" style={s.trainerText}>
              {tx('trainerLabel')}
            </Text>
            <Text className="font-bold" style={s.trainerText}>
              {data.trainerName}
            </Text>
          </View>
        </View>
        {data.notificationAction ?? (
          <Pressable
            disabled
            accessibilityRole="button"
            accessibilityLabel={tx('notifications')}
            accessibilityState={{ disabled: true }}
            style={s.iconButton}
          >
            <Icon name="bell" color={colors.ink} size={22} />
          </Pressable>
        )}
      </MotionHeader>
      <ScrollView contentContainerStyle={s.body}>
        {data.loading ? (
          <View
            style={s.page}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={tx('loading')}
          >
            <Card flush style={s.skeletonCard}>
              {[0, 1, 2, 3].map((row) => (
                <View
                  key={row}
                  style={[
                    s.skeletonRow,
                    row > 0 && { borderTopWidth: 1, borderTopColor: hair },
                  ]}
                >
                  <Shimmer
                    style={[
                      s.skeletonCircle,
                      { backgroundColor: colors.sunken },
                    ]}
                  />
                  <View style={s.skeletonMain}>
                    <Shimmer
                      style={[
                        s.skeletonTitle,
                        { backgroundColor: colors.sunken },
                      ]}
                    />
                    <Shimmer
                      style={[
                        s.skeletonMeta,
                        { backgroundColor: colors.sunken },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : (
          <>
            {next && (
              <Text style={[s.encouragement, { color: colors.accent }]}>
                {tx(next.today ? 'encouragement' : 'soon')}
              </Text>
            )}
            <Text accessibilityRole="header" style={s.title}>
              {t('clientHome.namedGreeting', { name: data.clientName })}
            </Text>
            {!next ? (
              <View style={s.page}>
                <View style={s.empty}>
                  <Mascot
                    pose="sit"
                    size={170}
                    style={s.emptyMascot}
                    resizeMode="contain"
                    accessible={false}
                  />
                  <Text style={s.emptyTitle}>{tx('empty')}</Text>
                  <Text className="text-secondary" style={s.emptyHint}>
                    {tx('emptyHint')}
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View style={s.page}>
                  <Card flush>
                    <View style={s.hero}>
                      <GradientBackground
                        radius={24}
                        radials={[
                          {
                            color: '#e0561b',
                            opacity: 0.14,
                            cx: 1.1,
                            cy: 0,
                            rx: 260,
                            ry: 200,
                            stop: 0.7,
                          },
                          {
                            color: '#ffb23d',
                            opacity: 0.22,
                            cx: 1,
                            cy: 0.3,
                            rx: 220,
                            ry: 160,
                            stop: 0.7,
                          },
                        ]}
                      />
                      <Mascot
                        pose={
                          next.hasProposal || next.status === 'proposed'
                            ? 'clipboard'
                            : 'wave'
                        }
                        size={92}
                        style={s.mascot}
                        resizeMode="contain"
                        accessible={false}
                      />
                      <View style={s.top}>
                        <Text
                          className="font-strong text-secondary"
                          style={s.small}
                        >
                          {tx(next.today ? 'today' : 'next')}
                        </Text>
                        <StatusPill
                          label={
                            next.hasProposal
                              ? tx('hasTransfer')
                              : next.status === 'proposed'
                                ? t('schedulingDemo.awaiting')
                                : tx('confirmed')
                          }
                          tone={
                            next.hasProposal || next.status === 'proposed'
                              ? 'warning'
                              : 'success'
                          }
                        />
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('clientHome.bookingSummary', {
                          date: fmt(next.date, true),
                          start: next.start,
                          end: next.end,
                        })}
                        onPress={() => data.onSelectBooking(next)}
                      >
                        <Text
                          className="font-medium text-secondary"
                          style={[s.small, s.date]}
                        >
                          {fmt(next.date, true)}
                        </Text>
                        <Text style={s.when}>
                          {t('clientHome.timeStart', { start: next.start })}
                          <Text style={[s.when, s.end]}>{next.end}</Text>
                        </Text>
                      </Pressable>
                      <View style={s.meta}>
                        <Pressable
                          disabled={!data.onProgramPreview}
                          accessibilityRole="button"
                          accessibilityLabel={preview(next)}
                          onPress={() => data.onProgramPreview?.(next)}
                        >
                          <Text style={s.program}>{preview(next)}</Text>
                        </Pressable>
                        <Text className="text-secondary" style={s.small}>
                          {tx(next.group ? 'group' : 'individual')}
                        </Text>
                      </View>
                      {data.renderActions && (
                        <View style={s.actions}>
                          {data.renderActions(next)}
                        </View>
                      )}
                    </View>
                  </Card>
                </View>
                {data.requests}
                {data.facts}
                {data.bookings.length > 1 && (
                  <View style={s.section}>
                    <Text style={s.sectionTitle}>{tx('upcoming')}</Text>
                    <Card flush>
                      {data.bookings.slice(1).map((row, index) => (
                        <Pressable
                          key={row.id}
                          accessibilityRole="button"
                          onPress={() => data.onSelectBooking(row)}
                          testID={`home-upcoming-${row.id}`}
                          style={[
                            s.upcoming,
                            index > 0 && {
                              borderTopWidth: 1,
                              borderTopColor: hair,
                            },
                          ]}
                        >
                          <Text style={s.rowTitle}>
                            {t('clientHome.upcomingBooking', {
                              date: fmt(row.date),
                              start: row.start,
                            })}
                          </Text>
                          <Text
                            className="font-medium text-secondary"
                            style={s.rowMeta}
                          >
                            {t('clientHome.upcomingProgram', {
                              program: preview(row),
                              group: row.group ? tx('groupSuffix') : '',
                            })}
                          </Text>
                        </Pressable>
                      ))}
                    </Card>
                  </View>
                )}
              </>
            )}
          </>
        )}
        {(data.loading || !next) && data.requests}
        {!data.loading && !next && data.facts}
        {data.onOpenHistory && !data.loading && (
          <View style={s.history}>
            <Button
              label={tx('history')}
              variant="soft"
              icon={<Icon name="list" color={colors.ink} size={18} />}
              onPress={data.onOpenHistory}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

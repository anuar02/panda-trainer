import {
  MotionHeader,
  Shimmer,
  MotionScrollView as ScrollView,
  MotionPressable as Pressable,
} from '@/ui/motion';

import { useState, type ReactNode } from 'react';
import { Sheet } from '@/ui/sheet';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { DemoScenario } from '@/features/demo/use-demo-scenario';
import { workoutClientHistory, workoutSessions } from '@/domain/workout';
import { useOptionalWorkoutDemo } from '@/features/workout-demo';
import { Card } from '@/ui/card';
import { GradientBackground } from '@/ui/gradient-background';
import { Icon } from '@/ui/icons';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { parity } from '@/ui/parity-tokens';
import type { clientHistory } from './ru';
import { styles as s } from './styles';

export type ClientHistoryRow = {
  id: string;
  date: string;
  start: string;
  group?: boolean;
  programName?: string | null;
  exercises: readonly {
    id: string;
    name: string;
    measure: 'reps' | 'seconds';
    bodyweight: boolean;
    skipped: boolean;
    replaced: boolean;
    sets: readonly {
      id: string;
      position: number;
      reps: number | null;
      seconds: number | null;
      weightGrams: number | null;
    }[];
  }[];
  notes: readonly { id: string; text: string }[];
};
export type ClientHistoryData = {
  initialSelectedId?: string;
  trainerName: string;
  timezone: string;
  rows: readonly ClientHistoryRow[];
  loading?: boolean;
  footer?: ReactNode;
};
export function ClientHistoryScreen({
  scenario = 'normal',
  data,
}: {
  scenario?: DemoScenario;
  data?: ClientHistoryData;
}) {
  return data ? (
    <ControlledClientHistory data={data} />
  ) : (
    <DemoClientHistoryScreen scenario={scenario} />
  );
}
function DemoClientHistoryScreen({
  scenario = 'normal',
}: {
  scenario?: DemoScenario;
}) {
  const { t, i18n } = useTranslation();
  const demo = useOptionalWorkoutDemo();
  const journals = demo?.hydrated ? workoutClientHistory(demo.state, 'c1') : [];
  const sessions = (demo?.state.catalog ?? workoutSessions)
    .filter(
      (session) =>
        session.id === 's4' ||
        journals.some((journal) => journal.sessionId === session.id),
    )
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  const { colors, scheme } = useTheme();
  const tx = (key: keyof typeof clientHistory) => t(`clientHistory.${key}`);
  const hair = scheme === 'light' ? '#efefeb' : '#212227';
  const empty = scenario === 'empty';
  const quietEmpty = (kind: 'Sessions' | 'Charges') => (
    <View style={[s.empty, { backgroundColor: colors.surface }]}>
      <View style={s.lead}>
        <GradientBackground
          start={scheme === 'light' ? '#e3e8fd' : '#232845'}
          end={scheme === 'light' ? '#d3dbfb' : '#1b1f36'}
          radius={21}
        />
        <View>
          <Icon
            name={kind === 'Sessions' ? 'calendar' : 'list'}
            size={20}
            color={scheme === 'light' ? '#2238b0' : '#aab8ff'}
          />
        </View>
      </View>
      <Text style={s.emptyTitle}>{tx(`empty${kind}Title`)}</Text>
      <Text className="text-secondary" style={s.emptyText}>
        {tx(`empty${kind}Text`)}
      </Text>
    </View>
  );
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`client-history-${scenario}`}
    >
      <MotionHeader motionKey={scenario} style={s.topbar}>
        <View style={s.trainer}>
          <View style={s.avatar}>
            <GradientBackground
              start={scheme === 'light' ? '#262b45' : '#26272e'}
              end={scheme === 'light' ? '#141726' : '#18191d'}
              radius={16}
            />
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
        <Pressable
          disabled
          accessibilityRole="button"
          accessibilityLabel={tx('notifications')}
          accessibilityState={{ disabled: true }}
          style={s.iconButton}
        >
          <Icon name="bell" color={colors.ink} size={22} />
        </Pressable>
      </MotionHeader>
      <ScrollView motionKey={scenario} contentContainerStyle={s.body}>
        {scenario === 'loading' || (demo && !demo.hydrated) ? (
          <View
            style={s.page}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={tx('loading')}
          >
            <Card rows flush style={s.rowsCard}>
              {[0, 1, 2, 3].map((row) => (
                <View
                  key={row}
                  style={[
                    s.row,
                    row > 0 && { borderTopWidth: 1, borderTopColor: hair },
                  ]}
                >
                  <Shimmer
                    style={[
                      s.skeletonCircle,
                      { backgroundColor: colors.sunken },
                    ]}
                  />
                  <View style={s.rowMain}>
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
            {scenario === 'offline' && (
              <Text
                accessibilityRole="alert"
                style={[
                  s.offline,
                  { backgroundColor: parity[scheme].warning.backgroundColor },
                ]}
              >
                {tx('offline')}
              </Text>
            )}
            <Text accessibilityRole="header" style={s.title}>
              {tx('title')}
            </Text>
            <View style={s.page}>
              <Text accessibilityRole="header" style={s.sectionTitle}>
                {tx('sessionsTitle')}
              </Text>
              {empty ? (
                quietEmpty('Sessions')
              ) : (
                <Card flush>
                  {sessions.map((session, index) => (
                    <View
                      key={session.id}
                      style={[
                        s.entry,
                        index > 0 && {
                          borderTopWidth: 1,
                          borderTopColor: hair,
                        },
                      ]}
                    >
                      <View
                        style={[s.date, { borderRightColor: colors.border }]}
                        accessible
                        accessibilityLabel={
                          session.id === 's4'
                            ? tx('sessionDate')
                            : `${new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${session.date}T12:00:00Z`))} · ${session.start}`
                        }
                      >
                        <Text style={s.day}>{session.date.slice(8)}</Text>
                        <Text className="text-secondary" style={s.month}>
                          {tx('month')}
                        </Text>
                        <Text className="text-secondary" style={s.time}>
                          {session.start}
                        </Text>
                      </View>
                      <View style={s.record}>
                        <Text style={s.program}>
                          {session.program ?? tx('noProgram')}
                        </Text>
                        <Text className="text-secondary" style={s.sessionKind}>
                          {tx(session.kind === 'group' ? 'group' : 'personal')}
                        </Text>
                        <StatusPill
                          label={tx(
                            journals.some(
                              (journal) => journal.sessionId === session.id,
                            )
                              ? 'finished'
                              : 'unmarked',
                          )}
                        />
                        {journals
                          .filter((journal) => journal.sessionId === session.id)
                          .map((journal) => (
                            <View key={journal.sessionId}>
                              {!!journal.changes && (
                                <Text
                                  className="text-secondary"
                                  style={s.sessionKind}
                                >
                                  {journal.changes}
                                </Text>
                              )}
                              {journal.notes.map((note, index) => (
                                <Text
                                  key={`${note.at}-${index}`}
                                  className="text-secondary"
                                  style={s.sharedNote}
                                >
                                  <Text className="font-bold">
                                    {tx('noteTrainer')}
                                  </Text>{' '}
                                  {note.text}
                                </Text>
                              ))}
                            </View>
                          ))}
                      </View>
                    </View>
                  ))}
                </Card>
              )}
              <View style={s.nextSection}>
                <Text accessibilityRole="header" style={s.sectionTitle}>
                  {tx('chargesTitle')}
                </Text>
                {empty ? (
                  quietEmpty('Charges')
                ) : (
                  <Card rows flush style={s.rowsCard}>
                    {(['chargeDateRecent', 'chargeDateEarlier'] as const).map(
                      (date, index) => (
                        <View
                          key={date}
                          style={[
                            s.row,
                            index > 0 && {
                              borderTopWidth: 1,
                              borderTopColor: hair,
                            },
                          ]}
                        >
                          <View style={s.rowMain}>
                            <Text style={s.rowTitle}>{tx('chargeReason')}</Text>
                            <Text className="text-secondary" style={s.rowMeta}>
                              {tx(date)}
                            </Text>
                          </View>
                          <Text
                            style={s.unit}
                            accessibilityLabel={tx('chargeLabel')}
                          >
                            {tx('chargeValue')}
                          </Text>
                        </View>
                      ),
                    )}
                  </Card>
                )}
                <Text className="text-secondary" style={s.footnote}>
                  {tx('footnote')}
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ControlledClientHistory({ data }: { data: ClientHistoryData }) {
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(
    data.initialSelectedId ?? null,
  );
  const selected = data.loading
    ? undefined
    : data.rows.find((row) => row.id === selectedId);
  const tx = (key: keyof typeof clientHistory) => t(`clientHistory.${key}`);
  const hair = scheme === 'light' ? '#efefeb' : '#212227';
  const initials = data.trainerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
  const month = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, { month: 'short', timeZone: 'UTC' })
      .format(new Date(`${date}T12:00:00Z`))
      .replaceAll('.', '');
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
      .format(new Date(`${date}T12:00:00Z`))
      .replaceAll('.', '');
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }).format(
      value,
    );
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`client-history-${data.loading ? 'loading' : data.rows.length ? 'normal' : 'empty'}`}
    >
      <MotionHeader style={s.topbar}>
        <View style={s.trainer}>
          <View style={s.avatar}>
            <GradientBackground
              start={scheme === 'light' ? '#262b45' : '#26272e'}
              end={scheme === 'light' ? '#141726' : '#18191d'}
              radius={16}
            />
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
        <Pressable
          disabled
          accessibilityRole="button"
          accessibilityLabel={tx('notifications')}
          accessibilityState={{ disabled: true }}
          style={s.iconButton}
        >
          <Icon name="bell" color={colors.ink} size={22} />
        </Pressable>
      </MotionHeader>
      <ScrollView contentContainerStyle={s.body}>
        {data.loading ? (
          <View
            style={s.page}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={tx('loading')}
          >
            <Card rows flush style={s.rowsCard}>
              {[0, 1, 2, 3].map((row) => (
                <View
                  key={row}
                  style={[
                    s.row,
                    row > 0 && { borderTopWidth: 1, borderTopColor: hair },
                  ]}
                >
                  <Shimmer
                    style={[
                      s.skeletonCircle,
                      { backgroundColor: colors.sunken },
                    ]}
                  />
                  <View style={s.rowMain}>
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
            <Text accessibilityRole="header" style={s.title}>
              {tx('title')}
            </Text>
            <View style={s.page}>
              <Text accessibilityRole="header" style={s.sectionTitle}>
                {tx('sessionsTitle')}
              </Text>
              {!data.rows.length ? (
                <View style={[s.empty, { backgroundColor: colors.surface }]}>
                  <View style={s.lead}>
                    <GradientBackground
                      start={scheme === 'light' ? '#e3e8fd' : '#232845'}
                      end={scheme === 'light' ? '#d3dbfb' : '#1b1f36'}
                      radius={21}
                    />
                    <Icon
                      name="calendar"
                      size={20}
                      color={scheme === 'light' ? '#2238b0' : '#aab8ff'}
                    />
                  </View>
                  <Text style={s.emptyTitle}>{tx('emptySessionsTitle')}</Text>
                  <Text className="text-secondary" style={s.emptyText}>
                    {tx('emptyFinishedText')}
                  </Text>
                </View>
              ) : (
                <Card flush>
                  {data.rows.map((row, index) => (
                    <Pressable
                      key={row.id}
                      accessibilityRole="button"
                      accessibilityLabel={t('clientHistory.openJournal', {
                        date: dateLabel(row.date),
                        start: row.start,
                      })}
                      onPress={() => setSelectedId(row.id)}
                      style={[
                        s.entry,
                        index > 0 && {
                          borderTopWidth: 1,
                          borderTopColor: hair,
                        },
                      ]}
                    >
                      <View
                        style={[s.date, { borderRightColor: colors.border }]}
                      >
                        <Text style={s.day}>{row.date.slice(8)}</Text>
                        <Text className="text-secondary" style={s.month}>
                          {month(row.date)}
                        </Text>
                        <Text className="text-secondary" style={s.time}>
                          {row.start}
                        </Text>
                      </View>
                      <View style={s.record}>
                        <Text style={s.program}>
                          {row.programName ?? tx('finished')}
                        </Text>
                        <Text className="text-secondary" style={s.sessionKind}>
                          {row.group === undefined
                            ? null
                            : tx(row.group ? 'group' : 'personal')}
                        </Text>
                        <StatusPill label={tx('finished')} />
                        {row.notes.map((note) => (
                          <Text
                            key={note.id}
                            className="text-secondary"
                            style={s.sharedNote}
                          >
                            <Text className="font-bold">
                              {tx('noteTrainer')}
                            </Text>{' '}
                            {note.text}
                          </Text>
                        ))}
                      </View>
                    </Pressable>
                  ))}
                </Card>
              )}
            </View>
          </>
        )}
        {data.footer}
      </ScrollView>
      <Sheet
        open={Boolean(selected)}
        title={selected?.programName ?? tx('finished')}
        onClose={() => setSelectedId(null)}
      >
        {selected && (
          <>
            <Text>
              {t('clientHistory.openJournal', {
                date: dateLabel(selected.date),
                start: selected.start,
              })}
            </Text>
            {selected.exercises.map((exercise) => (
              <View key={exercise.id}>
                <Text style={s.program}>{exercise.name}</Text>
                {exercise.skipped && (
                  <Text className="text-secondary">{tx('skipped')}</Text>
                )}
                {exercise.replaced && (
                  <Text className="text-secondary">{tx('replaced')}</Text>
                )}
                {exercise.sets.length ? (
                  exercise.sets.map((set) => (
                    <View key={set.id}>
                      <Text>
                        {t('clientHistory.actualSet', {
                          position: set.position + 1,
                        })}
                      </Text>
                      <Text>
                        {exercise.measure === 'seconds'
                          ? set.seconds === null
                            ? tx('secondsMissing')
                            : t('clientHistory.actualSeconds', {
                                value: number(set.seconds),
                              })
                          : set.reps === null
                            ? tx('repsMissing')
                            : t('clientHistory.actualReps', {
                                value: number(set.reps),
                              })}
                      </Text>
                      {!exercise.bodyweight && (
                        <Text>
                          {set.weightGrams === null
                            ? tx('weightMissing')
                            : t('clientHistory.actualWeight', {
                                value: number(set.weightGrams / 1000),
                              })}
                        </Text>
                      )}
                    </View>
                  ))
                ) : (
                  <Text className="text-secondary">{tx('noResults')}</Text>
                )}
              </View>
            ))}
            {selected.notes.map((note) => (
              <Text key={note.id} style={s.sharedNote}>
                <Text className="font-bold">{tx('noteTrainer')}</Text>{' '}
                {note.text}
              </Text>
            ))}
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}

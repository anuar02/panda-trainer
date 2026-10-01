import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/lib/database.types';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { GradientBackground } from '@/ui/gradient-background';
import { Icon, type IconName } from '@/ui/icons';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { parity } from '@/ui/parity-tokens';
import { styles as s } from '@/features/client-details/styles';
import { workspaceClientDetailsRu } from './details-strings';

export type WorkspaceClientDetailsData = {
  client: Database['public']['Tables']['client_records']['Row'];
  program:
    | (Database['public']['Tables']['client_programs']['Row'] & {
        items: Database['public']['Tables']['client_program_exercises']['Row'][];
      })
    | null;
  bookings: Pick<
    Database['public']['Tables']['bookings']['Row'],
    | 'id'
    | 'workspace_id'
    | 'client_record_id'
    | 'group_session_id'
    | 'starts_at'
    | 'ends_at'
    | 'status'
    | 'revision'
    | 'created_at'
    | 'updated_at'
  >[];
};

type Props = {
  data: WorkspaceClientDetailsData | null;
  timezone?: string;
  loading: boolean;
  error: boolean;
  onBack: () => void;
  onRetry: () => void;
};

type Tab = keyof typeof workspaceClientDetailsRu.tabs;
type StringKey = Exclude<
  keyof typeof workspaceClientDetailsRu,
  'tabs' | 'exercisePlan' | 'weight'
>;

const tabs = Object.keys(workspaceClientDetailsRu.tabs) as Tab[];

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toLocaleUpperCase('ru-RU') ?? '')
    .join('') || '—';

type BookingStatus = {
  key: 'proposed' | 'confirmed' | 'cancelled' | 'unknownStatus';
  tone: 'warning' | 'success' | 'neutral';
};

const bookingStatus = (status: string): BookingStatus => {
  if (status === 'proposed')
    return { key: 'proposed', tone: 'warning' as const };
  if (status === 'confirmed')
    return { key: 'confirmed', tone: 'success' as const };
  if (status === 'cancelled_by_client' || status === 'cancelled_by_trainer')
    return { key: 'cancelled', tone: 'neutral' };
  return { key: 'unknownStatus', tone: 'neutral' };
};

export function WorkspaceClientDetailsScreen({
  data,
  timezone = 'Asia/Almaty',
  loading,
  error,
  onBack,
  onRetry,
}: Props) {
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const [tab, setTab] = useState<Tab>('sessions');
  const secondary = { color: colors.secondary };
  const hair = scheme === 'dark' ? '#212227' : '#efefeb';
  const text = (key: StringKey) => t(`workspaceClientDetails.${key}`);
  const monthDay = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  });
  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  });
  const number = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 3,
  });
  const empty = (icon: IconName, title: string, hint: string) => (
    <Card style={s.empty}>
      <Icon name={icon} size={24} color={colors.secondary} />
      <Text style={s.heading}>{title}</Text>
      <Text style={[s.small, secondary, s.center]}>{hint}</Text>
    </Card>
  );
  const toolbar = (
    <View style={s.topbar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text('back')}
        onPress={onBack}
        style={s.iconButton}
      >
        <Icon name="chevL" size={22} color={colors.ink} />
      </Pressable>
      {data?.client.user_id === null && (
        <Button
          label={text('invite')}
          variant="ghost"
          compact
          disabled
          accessibilityHint={text('inviteUnavailable')}
        />
      )}
    </View>
  );

  if (loading)
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={s.root}>
        {toolbar}
        <ActivityIndicator
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={text('loading')}
          style={s.loading}
        />
      </SafeAreaView>
    );

  if (error)
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={s.root}>
        {toolbar}
        <View style={s.content}>
          {empty('user', text('errorTitle'), text('errorHint'))}
          <Button label={text('retry')} variant="soft" onPress={onRetry} />
        </View>
      </SafeAreaView>
    );

  if (!data)
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={s.root}>
        {toolbar}
        <View style={s.content}>
          {empty('user', text('notFound'), text('notFoundHint'))}
        </View>
      </SafeAreaView>
    );

  const orderedItems = [...(data.program?.items ?? [])].sort(
    (first, second) => first.position - second.position,
  );
  const clientName = data.client.display_name;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID="workspace-client-details"
    >
      {toolbar}
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
                {initials(clientName)}
              </Text>
            </View>
            <View style={s.flex}>
              <Text style={s.name}>{clientName}</Text>
              <Text style={[s.small, secondary]}>
                {data.client.phone?.trim() || text('noPhone')}
              </Text>
            </View>
          </View>
          <View style={s.metrics}>
            <Card flush style={s.metric}>
              <Text style={[s.label, s.metricLabel, secondary]}>
                {text('balance')}
              </Text>
              <Text style={s.balance} accessibilityLabel={text('unknown')}>
                {text('unknown')}
              </Text>
            </Card>
            <Card flush style={s.metric}>
              <Text style={[s.label, s.metricLabel, secondary]}>
                {text('due')}
              </Text>
              <Text style={s.due} accessibilityLabel={text('unknown')}>
                {text('unknown')}
              </Text>
            </Card>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabs}
          accessibilityLabel={text('sections')}
        >
          {tabs.map((value) => {
            const selected = tab === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(value)}
                style={[
                  s.chip,
                  {
                    backgroundColor: selected
                      ? parity[scheme].accent.backgroundColor
                      : colors.surface,
                    borderColor: selected
                      ? parity[scheme].accent.backgroundColor
                      : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    s.chipText,
                    {
                      color: selected
                        ? parity[scheme].accent.color
                        : colors.secondary,
                    },
                  ]}
                >
                  {t(`workspaceClientDetails.tabs.${value}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={[s.content, s.stack]}>
          {tab === 'sessions' &&
            (data.bookings.length ? (
              <Card flush style={s.rows}>
                {data.bookings.map((booking, index) => {
                  const status = bookingStatus(booking.status);
                  const startsAt = new Date(booking.starts_at);
                  const endsAt = new Date(booking.ends_at);
                  const kind = booking.group_session_id ? 'group' : 'personal';
                  return (
                    <View
                      key={booking.id}
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
                        <Text style={s.bookingTitle}>
                          {t('workspaceClientDetails.sessionTime', {
                            date: monthDay.format(startsAt),
                            start: time.format(startsAt),
                            end: time.format(endsAt),
                          })}
                        </Text>
                        <Text style={[s.small, s.bookingMeta, secondary]}>
                          {t(`workspaceClientDetails.${kind}`)}
                        </Text>
                      </View>
                      <StatusPill
                        label={text(status.key)}
                        tone={status.tone}
                        dot={status.tone !== 'neutral'}
                      />
                    </View>
                  );
                })}
              </Card>
            ) : (
              empty('calendar', text('noSessions'), text('noSessionsHint'))
            ))}
          {tab === 'program' &&
            (data.program && orderedItems.length ? (
              <View style={s.stack}>
                <View
                  style={[
                    s.notice,
                    { backgroundColor: parity[scheme].accent.backgroundColor },
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
                    {t('workspaceClientDetails.currentProgramName', {
                      name: data.program.name,
                    })}
                  </Text>
                </View>
                <Card flush style={s.rows}>
                  {orderedItems.map((exercise, index) => {
                    const prescription =
                      exercise.planned_reps ?? exercise.planned_seconds ?? '—';
                    const reps = exercise.planned_seconds
                      ? `${prescription} ${text('seconds')}`
                      : prescription;
                    const weight = exercise.planned_weight_g;
                    return (
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
                          <Text style={s.rowTitle}>
                            {exercise.exercise_name_snapshot}
                          </Text>
                          <Text style={[s.small, secondary]}>
                            {t('workspaceClientDetails.exercisePlan', {
                              sets: exercise.planned_sets,
                              reps,
                            })}
                            {weight !== null && weight > 0
                              ? ` · ${t('workspaceClientDetails.weight', {
                                  amount: number.format(weight / 1000),
                                })}`
                              : ''}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
            ) : (
              empty('dumbbell', text('noProgram'), text('noProgramHint'))
            ))}
          {tab === 'progress' &&
            empty(
              'trend',
              text('unavailableTitle'),
              text('progressUnavailable'),
            )}
          {tab === 'billing' &&
            empty(
              'wallet',
              text('unavailableTitle'),
              text('billingUnavailable'),
            )}
          {tab === 'notes' &&
            empty('lock', text('unavailableTitle'), text('notesUnavailable'))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

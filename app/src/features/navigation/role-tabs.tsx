import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform, View } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/theme';
import { WorkoutDock, useOptionalWorkoutDemo } from '@/features/workout-demo';
import {
  getWorkoutSession,
  workoutSessions,
  type WorkoutState,
} from '@/domain/workout';
import { useOptionalSchedulingDemo } from '@/features/scheduling-demo/provider';
import { NativeTabsInsetsProvider } from './tab-bar-layout';

export const routes = {
  trainer: [
    { name: 'today', label: 'today', sf: 'house', md: 'home' },
    {
      name: 'schedule',
      label: 'schedule',
      sf: 'calendar',
      md: 'calendar_month',
    },
    { name: 'clients', label: 'clients', sf: 'person.2', md: 'group' },
    {
      name: 'library',
      label: 'library',
      sf: 'square.stack',
      md: 'library_books',
    },
    {
      name: 'trainer-profile',
      label: 'profile',
      sf: 'person.crop.circle',
      md: 'account_circle',
    },
  ],
  client: [
    { name: 'home', label: 'home', sf: 'house', md: 'home' },
    { name: 'program', label: 'program', sf: 'dumbbell', md: 'fitness_center' },
    { name: 'history', label: 'history', sf: 'list.bullet', md: 'list' },
    {
      name: 'progress',
      label: 'progress',
      sf: 'chart.line.uptrend.xyaxis',
      md: 'trending_up',
    },
    {
      name: 'client-profile',
      label: 'profile',
      sf: 'person.crop.circle',
      md: 'account_circle',
    },
  ],
} as const;

export function getTabBadgeValue(count: number | null | undefined) {
  return typeof count === 'number' && Number.isSafeInteger(count) && count > 0
    ? String(count)
    : undefined;
}

export function hasWorkoutDock(
  workout: { hydrated: boolean; state: WorkoutState } | null,
) {
  if (!workout?.hydrated) return false;
  const { state } = workout;
  const active = state.activeSessionId
    ? state.sessions[state.activeSessionId]
    : undefined;
  const journal =
    active && !active.finished
      ? active
      : (state.catalog ?? workoutSessions)
          .filter((session) => session.date === '2026-09-14')
          .sort(
            (a, b) =>
              b.start.localeCompare(a.start) || a.id.localeCompare(b.id),
          )
          .map((session) => state.sessions[session.id])
          .find((entry) => entry && !entry.finished);
  return Boolean(
    journal &&
    !journal.finished &&
    getWorkoutSession(journal.sessionId, state.catalog),
  );
}

function PortableWorkoutDock() {
  const [visible, setVisible] = useState(false);
  return (
    <SafeAreaView
      edges={visible ? ['bottom', 'left', 'right'] : ['left', 'right']}
    >
      <View
        onLayout={({ nativeEvent }) =>
          setVisible(nativeEvent.layout.height > 0)
        }
      >
        <WorkoutDock />
      </View>
    </SafeAreaView>
  );
}

export function RoleTabs({ role }: { role: keyof typeof routes }) {
  const { t } = useTranslation();
  const { scheme, colors } = useTheme();
  const scheduling = useOptionalSchedulingDemo();
  const workout = useOptionalWorkoutDemo();
  const dockVisible = hasWorkoutDock(workout);
  const count =
    role === 'trainer' && scheduling?.hydrated && !scheduling.readError
      ? Object.values(scheduling.state.requests).filter(
          (request) =>
            request.awaiting === 'trainer' &&
            (request.state === 'pending' || request.state === 'counter'),
        ).length
      : undefined;
  const badge = getTabBadgeValue(count);
  const accessory =
    Platform.OS === 'ios' && parseFloat(String(Platform.Version)) >= 26;
  return (
    <NativeTabsInsetsProvider>
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <NativeTabs
          tintColor={colors.accent}
          iconColor={{ default: colors.secondary, selected: colors.accent }}
          labelStyle={{
            default: { color: colors.secondary },
            selected: { color: colors.accent },
          }}
          backgroundColor={Platform.OS === 'ios' ? undefined : colors.surface}
          minimizeBehavior="onScrollDown"
          labelVisibilityMode="labeled"
          disableTransparentOnScrollEdge
          unstable_nativeProps={{ colorScheme: scheme }}
        >
          {routes[role].map((route) => {
            const label = t(`tabs.${route.label}`).replace('\u00ad', '');
            return (
              <NativeTabs.Trigger
                key={route.name}
                name={route.name}
                accessibilityLabel={label}
                contentStyle={{ backgroundColor: colors.canvas }}
              >
                <NativeTabs.Trigger.Icon sf={route.sf} md={route.md} />
                <NativeTabs.Trigger.Label>{label}</NativeTabs.Trigger.Label>
                {route.name === 'today' && badge !== undefined && (
                  <NativeTabs.Trigger.Badge>{badge}</NativeTabs.Trigger.Badge>
                )}
              </NativeTabs.Trigger>
            );
          })}
          {role === 'trainer' && accessory && dockVisible && (
            <NativeTabs.BottomAccessory>
              <WorkoutDock />
            </NativeTabs.BottomAccessory>
          )}
        </NativeTabs>
        {role === 'trainer' && !accessory && <PortableWorkoutDock />}
      </View>
    </NativeTabsInsetsProvider>
  );
}

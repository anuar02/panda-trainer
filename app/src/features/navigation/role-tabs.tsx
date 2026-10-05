import { TabMotion, useScreenEntrance } from '@/ui/motion';
import { Tabs } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Keyboard, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/theme';
import { Icon } from '@/ui/icons';
import { WorkoutDock } from '@/features/workout-demo';
import { TabBarSurface } from './tab-bar-surface';
import { TabBarLayoutProvider, TAB_BAR_HORIZONTAL_INSET, useTabBarLayout } from './tab-bar-layout';
type BottomTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>['tabBar']>
>[0];
export const routes = {
  trainer: [
    { name: 'today', label: 'today', icon: 'home' },
    { name: 'schedule', label: 'schedule', icon: 'calendar' },
    { name: 'clients', label: 'clients', icon: 'users' },
    { name: 'library', label: 'library', icon: 'layers' },
    { name: 'trainer-profile', label: 'profile', icon: 'user' },
  ],
  client: [
    { name: 'home', label: 'home', icon: 'home' },
    { name: 'program', label: 'program', icon: 'dumbbell' },
    { name: 'history', label: 'history', icon: 'list' },
    { name: 'progress', label: 'progress', icon: 'trend' },
    { name: 'client-profile', label: 'profile', icon: 'user' },
  ],
} as const;
export function FloatingTabBar({
  role,
  state,
  navigation,
}: BottomTabBarProps & { role: keyof typeof routes }) {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const { bottomOffset, onTabBarLayout } = useTabBarLayout();
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const { fontScale } = useWindowDimensions();
  const entry = useScreenEntrance();
  const params = state.routes[state.index]?.params;
  const scenario =
    params && 'scenario' in params && typeof params.scenario === 'string'
      ? params.scenario
      : '';
  const entryRevision = `${entry.revision}:${scenario}`;
  const warmed = useRef(new Set<string>());
  useEffect(() => {
    const pending = state.routes.filter(
      (route) =>
        route.key !== state.routes[state.index]?.key &&
        !warmed.current.has(route.key),
    );
    let cancelled = false;
    if (typeof navigation.preload !== 'function') return;
    let cancel = () => {};
    const schedule = (callback: () => void) => {
      if (typeof requestIdleCallback === 'function') {
        const handle = requestIdleCallback(callback);
        return () => cancelIdleCallback(handle);
      }
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const frame = requestAnimationFrame(() => {
        timeout = setTimeout(callback, 0);
      });
      return () => {
        cancelAnimationFrame(frame);
        if (timeout !== undefined) clearTimeout(timeout);
      };
    };
    const warm = () => {
      if (cancelled) return;
      const route = pending.shift();
      if (!route) return;
      warmed.current.add(route.key);
      navigation.preload(route.name, route.params);
      cancel = schedule(warm);
    };
    cancel = schedule(warm);
    return () => {
      cancelled = true;
      cancel();
    };
  }, [navigation, state.routes, state.index]);
  const dark = scheme === 'dark';
  const fontSize = role === 'trainer' ? 10 : 12;
  const accent = dark ? '#6f86ff' : '#2b48d6';
  const secondary = dark ? '#a3a4ab' : '#545868';
  if (keyboardVisible) return null;
  return (
    <View
      testID="floating-tab-bar-stack"
      pointerEvents="box-none"
      onLayout={onTabBarLayout}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: TAB_BAR_HORIZONTAL_INSET,
        paddingBottom: bottomOffset,
      }}
    >
      {role === 'trainer' && <WorkoutDock />}
      <View accessibilityLabel={t('tabs.navigation')}>
        <TabBarSurface>
        {routes[role].map((item) => {
          const route = state.routes.find((entry) => entry.name === item.name);
          if (!route) return null;
          const selected = state.routes[state.index ?? 0]?.key === route.key;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={t(`tabs.${item.label}`).replace('\u00ad', '')}
              accessibilityState={{ selected }}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!selected && !event.defaultPrevented)
                  navigation.navigate(route.name, route.params);
              }}
              onLongPress={() =>
                navigation.emit({ type: 'tabLongPress', target: route.key })
              }
              style={{
                flexGrow: 1,
                flexBasis: fontScale > 1.3 ? '33%' : '20%',
                minHeight: Math.max(
                  54,
                  22 + 3 + fontSize * 1.45 * fontScale + 10,
                ),
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                borderRadius: 20,
              }}
            >
              {
                <TabMotion
                  indicator
                  selected={selected}
                  revision={entryRevision}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 5,
                    bottom: 5,
                    left: '6%',
                    right: '6%',
                    borderRadius: 16,
                    backgroundColor: dark
                      ? 'rgba(111,134,255,0.16)'
                      : 'rgba(43,72,214,0.1)',
                  }}
                />
              }
              <TabMotion
                selected={selected}
                revision={entryRevision}
                inactive={
                  <Icon
                    name={item.icon}
                    size={22}
                    strokeWidth={1.8}
                    color={secondary}
                  />
                }
              >
                <Icon
                  name={item.icon}
                  size={22}
                  strokeWidth={selected ? 2.3 : 1.8}
                  color={accent}
                />
              </TabMotion>
              <Text
                style={{
                  fontFamily: selected ? 'Inter_700Bold' : 'Inter_600SemiBold',
                  fontSize,
                  lineHeight: fontSize * 1.45,
                  letterSpacing: role === 'trainer' ? -0.15 : 0.05,
                  color: selected ? (dark ? '#8c9eff' : '#2238b0') : secondary,
                  textAlign: 'center',
                }}
              >
                {t(`tabs.${item.label}`)}
              </Text>
            </Pressable>
          );
        })}
        </TabBarSurface>
      </View>
    </View>
  );
}
export function RoleTabs({ role }: { role: keyof typeof routes }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <TabBarLayoutProvider role={role}>
    <Tabs
      initialRouteName={routes[role][0].name}
      tabBar={(props) => <FloatingTabBar {...props} role={role} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      {routes[role].map((route) => (
        <Tabs.Screen
          key={route.name}
          name={route.name}
          options={{ title: t(`tabs.${route.label}`) }}
        />
      ))}
    </Tabs>
    </TabBarLayoutProvider>
  );
}

import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui/theme';
import { Icon } from '@/ui/icons';
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
  insets,
}: BottomTabBarProps & { role: keyof typeof routes }) {
  const { t } = useTranslation();
  const { scheme, colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const dark = scheme === 'dark';
  const fontSize = role === 'trainer' ? 10 : 12;
  const accent = dark ? '#6f86ff' : '#2b48d6';
  const secondary = dark ? '#a3a4ab' : '#545868';
  return (
    <View
      style={{
        backgroundColor: colors.canvas,
        paddingHorizontal: 12,
        paddingBottom: Math.max(10, insets.bottom),
      }}
    >
      <View
        accessibilityLabel={t('tabs.navigation')}
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          padding: 6,
          borderRadius: 26,
          backgroundColor: dark
            ? 'rgba(21,22,25,0.95)'
            : 'rgba(252,252,253,0.9)',
          boxShadow: dark
            ? '0 14px 34px -14px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.07)'
            : '0 14px 34px -14px rgba(15,18,40,0.35), 0 0 0 1px rgba(20,24,50,0.08)',
        }}
      >
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
              {selected && (
                <View
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
              )}
              <Icon
                name={item.icon}
                size={22}
                strokeWidth={selected ? 2.3 : 1.8}
                color={selected ? accent : secondary}
              />
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
      </View>
    </View>
  );
}
export function RoleTabs({ role }: { role: keyof typeof routes }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
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
  );
}

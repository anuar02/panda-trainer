import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTranslation } from 'react-i18next';
import { tokens, useTheme } from '@/ui/theme';
const routes = {
  trainer: [
    { name: 'today', label: 'today', icon: 'calendar' },
    { name: 'clients', label: 'clients', icon: 'users' },
    { name: 'templates', label: 'templates', icon: 'book-open' },
    { name: 'trainer-profile', label: 'profile', icon: 'user' },
  ],
  client: [
    { name: 'home', label: 'home', icon: 'home' },
    { name: 'workouts', label: 'workouts', icon: 'activity' },
    { name: 'progress', label: 'progress', icon: 'trending-up' },
    { name: 'client-profile', label: 'profile', icon: 'user' },
  ],
} as const;
export function RoleTabs({ role }: { role: keyof typeof routes }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return (
    <Tabs
      initialRouteName={routes[role][0].name}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.secondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height:
            Math.max(
              tokens.size.tabBar,
              tokens.size.icon +
                tokens.fontSize.label * fontScale +
                tokens.spacing.row * 2,
            ) + insets.bottom,
        },
        tabBarLabelStyle: {
          fontFamily: tokens.font.medium,
          fontSize: tokens.fontSize.label,
        },
        tabBarItemStyle: { minHeight: tokens.size.touch },
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      {routes[role].map((route) => (
        <Tabs.Screen
          key={route.name}
          name={route.name}
          options={{
            title: t(`tabs.${route.label}`),
            tabBarIcon: ({ color, size }) => (
              <Feather name={route.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

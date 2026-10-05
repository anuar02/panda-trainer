import type { ComponentProps } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import {
  Keyboard,
  Text,
  StyleSheet,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import {
  ClientProfileScreen,
  TrainerProfileScreen,
} from '../src/features/profiles/profile-screens';
import { FloatingTabBar, routes } from '../src/features/navigation/role-tabs';
import {
  TabBarLayoutProvider,
  useTabBarLayout,
} from '../src/features/navigation/tab-bar-layout';
import { ru as mockRu } from '../src/lib/i18n/ru';

jest.mock('expo-router', () => ({ Tabs: () => null }));
jest.mock('expo-glass-effect', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GlassView: View,
    isLiquidGlassAvailable: () => true,
    isGlassEffectAPIAvailable: () => true,
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
  };
});
jest.mock('@/ui/theme', () => ({
  useTheme: () => ({
    scheme: 'dark',
    colors: {
      canvas: '#0b0c0e',
      surface: '#151619',
      border: '#292a30',
      accent: '#6f86ff',
      secondary: '#a3a4ab',
    },
  }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      mockRu.tabs[key.slice(5) as keyof typeof mockRu.tabs] ?? key,
  }),
}));
jest.mock('@/features/workout-demo', () => {
  const { Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WorkoutDock: () => (
      <Pressable testID="resume-dock" accessibilityRole="button" />
    ),
  };
});

function InsetProbe() {
  const { bottomInset } = useTabBarLayout();
  return <Text testID="reserved-inset">{bottomInset}</Text>;
}

function props(role: 'trainer' | 'client') {
  return {
    role,
    state: {
      index: 0,
      routes: routes[role].map((route) => ({
        name: route.name,
        key: route.name,
      })),
    },
    navigation: {
      navigate: jest.fn(),
      emit: jest.fn().mockReturnValue({ defaultPrevented: false }),
    },
    insets: { top: 0, bottom: 34, left: 0, right: 0 },
  } as unknown as ComponentProps<typeof FloatingTabBar>;
}

afterEach(() => jest.restoreAllMocks());

test.each(['trainer', 'client'] as const)(
  'floating panel keeps %s tab events and targets accessible',
  async (role) => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    jest
      .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
      .mockResolvedValue(false);
    const tabProps = props(role);
    const view = await render(
      <TabBarLayoutProvider>
        <FloatingTabBar {...tabProps} />
      </TabBarLayoutProvider>,
    );
    expect(view.getByTestId('tab-bar-glass')).toBeVisible();
    const tabs = view.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    expect(tabs.every((tab) => tab.props.accessibilityLabel.length > 0)).toBe(
      true,
    );
    await fireEvent.press(tabs[1]!);
    expect(tabProps.navigation.navigate).toHaveBeenCalledWith(
      routes[role][1].name,
      undefined,
    );
    await fireEvent(tabs[2]!, 'longPress');
    expect(tabProps.navigation.emit).toHaveBeenLastCalledWith({
      type: 'tabLongPress',
      target: routes[role][2].name,
    });
    expect(view.queryByTestId('resume-dock') !== null).toBe(role === 'trainer');
  },
);

test('keyboard releases measured dock and panel reservation and cleans subscriptions', async () => {
  const listeners = new Map<string, () => void>();
  const removals: jest.Mock[] = [];
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
    listeners.set(event, listener as () => void);
    const remove = jest.fn(() => listeners.delete(event));
    removals.push(remove);
    return { remove } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
  const view = await render(
    <TabBarLayoutProvider>
      <InsetProbe />
      <FloatingTabBar {...props('trainer')} />
    </TabBarLayoutProvider>,
  );
  await fireEvent(view.getByTestId('floating-tab-bar'), 'layout', {
    nativeEvent: { layout: { height: 160, width: 366, x: 0, y: 0 } },
  });
  expect(view.getByTestId('reserved-inset')).toHaveTextContent('210');
  await act(async () => listeners.get('keyboardDidShow')?.());
  expect(view.queryByTestId('floating-tab-bar')).toBeNull();
  expect(view.queryByTestId('resume-dock')).toBeNull();
  expect(view.getByTestId('reserved-inset')).toHaveTextContent('0');
  await act(async () => listeners.get('keyboardDidHide')?.());
  expect(view.getByTestId('resume-dock')).toBeVisible();
  expect(view.getByTestId('reserved-inset')).toHaveTextContent('210');
  await view.unmount();
  expect(removals).toHaveLength(2);
  expect(removals.every((remove) => remove.mock.calls.length === 1)).toBe(true);
});

test.each(['trainer', 'client'] as const)(
  '%s profile reserves measured floating panel space',
  async (role) => {
    const Profile =
      role === 'trainer' ? TrainerProfileScreen : ClientProfileScreen;
    const view = await render(
      <TabBarLayoutProvider>
        <Profile />
        <FloatingTabBar {...props(role)} />
      </TabBarLayoutProvider>,
    );
    await fireEvent(view.getByTestId('floating-tab-bar'), 'layout', {
      nativeEvent: { layout: { height: 160, width: 366, x: 0, y: 0 } },
    });
    let scroll = view.getByText('profiles.calm').parent;
    while (scroll && !('contentContainerStyle' in scroll.props))
      scroll = scroll.parent;
    expect(scroll).not.toBeNull();
    expect(
      StyleSheet.flatten(scroll?.props.contentContainerStyle).paddingBottom,
    ).toBe(210);
  },
);

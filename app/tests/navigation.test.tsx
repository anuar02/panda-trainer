import type { ComponentProps } from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { FloatingTabBar, routes } from '../src/features/navigation/role-tabs';
import { ru as mockRu } from '../src/lib/i18n/ru';

jest.mock('expo-router', () => ({ Tabs: () => null }));
jest.mock('@/ui/theme', () => ({
  useTheme: () => ({ scheme: 'dark', colors: { canvas: '#0b0c0e' } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => mockRu.tabs[key.slice(5) as keyof typeof mockRu.tabs],
  }),
}));

test.each(['trainer', 'client'] as const)(
  '%s has five accessible destinations and respects navigation events',
  async (role) => {
    const navigate = jest.fn();
    const emit = jest.fn().mockReturnValue({ defaultPrevented: false });
    const props = {
      role,
      state: {
        index: 0,
        routes: routes[role].map((item) => ({
          key: item.name,
          name: item.name,
        })),
      },
      navigation: { navigate, emit },
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
    } as unknown as ComponentProps<typeof FloatingTabBar>;
    const screen = await render(<FloatingTabBar {...props} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    expect(tabs[0]?.props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(tabs[0]!);
    expect(navigate).not.toHaveBeenCalled();
    await fireEvent.press(tabs[1]!);
    expect(navigate).toHaveBeenCalledWith(routes[role][1].name, undefined);
    navigate.mockClear();
    emit.mockReturnValue({ defaultPrevented: true });
    await fireEvent.press(tabs[2]!);
    expect(navigate).not.toHaveBeenCalled();
    await fireEvent(tabs[3]!, 'longPress');
    expect(emit).toHaveBeenLastCalledWith({
      type: 'tabLongPress',
      target: routes[role][3].name,
    });
  },
);

test('preloads one tab per idle slot and never blocks initial rendering', async () => {
  const idle = Object.getOwnPropertyDescriptor(
    globalThis,
    'requestIdleCallback',
  );
  const cancel = Object.getOwnPropertyDescriptor(
    globalThis,
    'cancelIdleCallback',
  );
  const callbacks: (() => void)[] = [];
  const cancelled = jest.fn();
  Object.defineProperty(globalThis, 'requestIdleCallback', {
    configurable: true,
    value: (callback: () => void) => callbacks.push(callback),
  });
  Object.defineProperty(globalThis, 'cancelIdleCallback', {
    configurable: true,
    value: cancelled,
  });
  const preload = jest.fn();
  const props = {
    role: 'client',
    state: {
      index: 0,
      routes: routes.client.map((item) => ({
        key: item.name,
        name: item.name,
      })),
    },
    navigation: { preload, navigate: jest.fn(), emit: jest.fn() },
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as unknown as ComponentProps<typeof FloatingTabBar>;
  try {
    const view = await render(<FloatingTabBar {...props} />);
    expect(preload).not.toHaveBeenCalled();
    expect(view.getAllByRole('tab')).toHaveLength(5);
    for (let index = 0; index < 4; index++) {
      await act(async () => callbacks.shift()?.());
      expect(preload).toHaveBeenCalledTimes(index + 1);
    }
    expect(preload.mock.calls.map((call) => call[0])).toEqual([
      'program',
      'history',
      'progress',
      'client-profile',
    ]);
    await view.unmount();
    expect(cancelled).toHaveBeenCalled();
  } finally {
    if (idle) Object.defineProperty(globalThis, 'requestIdleCallback', idle);
    else Reflect.deleteProperty(globalThis, 'requestIdleCallback');
    if (cancel) Object.defineProperty(globalThis, 'cancelIdleCallback', cancel);
    else Reflect.deleteProperty(globalThis, 'cancelIdleCallback');
  }
});

import type { ComponentProps } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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

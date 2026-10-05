import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { TabBarSurface } from '../src/features/navigation/tab-bar-surface';
import mockTokens from '../src/ui/tokens.json';

let mockScheme: 'light' | 'dark' = 'dark';
jest.mock('@/ui/theme', () => ({
  useTheme: () => ({
    scheme: mockScheme,
    colors: mockTokens.colors[mockScheme],
  }),
}));
jest.mock('expo-glass-effect', () => ({
  GlassView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
  isLiquidGlassAvailable: jest.fn(() => true),
  isGlassEffectAPIAvailable: jest.fn(() => true),
}));
const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
  mockScheme = 'dark';
  jest.restoreAllMocks();
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(true);
  jest.mocked(isGlassEffectAPIAvailable).mockReturnValue(true);
});
test.each(['android', 'web'] as const)(
  '%s uses the translucent theme surface',
  async (os) => {
    Platform.OS = os;
    const view = await render(<TabBarSurface />);
    expect(view.getByTestId('tab-bar-fallback')).toHaveStyle({
      backgroundColor: `${mockTokens.colors.dark.surface}f2`,
    });
    expect(view.queryByTestId('tab-bar-glass')).toBeNull();
  },
);
test.each(['light', 'dark'] as const)(
  'supported iOS uses native glass in %s app theme',
  async (scheme) => {
    Platform.OS = 'ios';
    mockScheme = scheme;
    jest
      .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
      .mockResolvedValue(false);
    const view = await render(<TabBarSurface />);
    expect(view.getByTestId('tab-bar-glass').props.colorScheme).toBe(scheme);
    expect(view.getByTestId('tab-bar-glass').props.isInteractive).toBe(true);
    expect(view.getByTestId('tab-bar-glass')).toHaveStyle({ borderRadius: 32 });
  },
);
test.each(['design', 'api'] as const)(
  'missing %s support uses translucent fallback',
  async (gate) => {
    Platform.OS = 'ios';
    jest
      .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
      .mockResolvedValue(false);
    jest
      .mocked(
        gate === 'design' ? isLiquidGlassAvailable : isGlassEffectAPIAvailable,
      )
      .mockReturnValue(false);
    const view = await render(<TabBarSurface />);
    expect(view.getByTestId('tab-bar-fallback')).toBeTruthy();
  },
);
test('live transparency preference wins over stale read and listener is cleaned up', async () => {
  Platform.OS = 'ios';
  let resolveRead: ((enabled: boolean) => void) | undefined;
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockReturnValue(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );
  let listener: ((enabled: boolean) => void) | undefined;
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    event: string,
    callback: (enabled: boolean) => void,
  ) => {
    if (event === 'reduceTransparencyChanged') listener = callback;
    return { remove };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
  const view = await render(<TabBarSurface />);
  expect(view.getByTestId('tab-bar-fallback')).toBeTruthy();
  await act(async () => listener?.(true));
  await act(async () => resolveRead?.(false));
  expect(view.queryByTestId('tab-bar-glass')).toBeNull();
  expect(view.getByTestId('tab-bar-fallback')).toHaveStyle({
    backgroundColor: mockTokens.colors.dark.surface,
  });
  await act(async () => listener?.(false));
  expect(view.getByTestId('tab-bar-glass')).toBeTruthy();
  await view.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});

test('mounted surface follows app theme changes in native glass and fallback', async () => {
  Platform.OS = 'ios';
  jest
    .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
    .mockResolvedValue(false);
  const view = await render(<TabBarSurface />);
  expect(view.getByTestId('tab-bar-glass').props.colorScheme).toBe('dark');
  mockScheme = 'light';
  await view.rerender(<TabBarSurface />);
  expect(view.getByTestId('tab-bar-glass').props.colorScheme).toBe('light');
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(false);
  await view.rerender(<TabBarSurface />);
  expect(view.getByTestId('tab-bar-fallback')).toHaveStyle({
    backgroundColor: `${mockTokens.colors.light.surface}e6`,
    borderColor: mockTokens.colors.light.border,
  });
  mockScheme = 'dark';
  await view.rerender(<TabBarSurface />);
  expect(view.getByTestId('tab-bar-fallback')).toHaveStyle({
    backgroundColor: `${mockTokens.colors.dark.surface}f2`,
    borderColor: mockTokens.colors.dark.border,
  });
});

test('failed transparency query keeps the safe opaque surface', async () => {
  Platform.OS = 'ios';
  jest
    .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
    .mockRejectedValue(new Error('unavailable'));
  const view = await render(<TabBarSurface />);
  expect(view.getByTestId('tab-bar-fallback')).toHaveStyle({
    backgroundColor: mockTokens.colors.dark.surface,
  });
  expect(view.queryByTestId('tab-bar-glass')).toBeNull();
});

test('pending transparency read after unmount does not revive a removed surface', async () => {
  Platform.OS = 'ios';
  let resolveRead: ((enabled: boolean) => void) | undefined;
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockReturnValue(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );
  const remove = jest.fn();
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove } as unknown as ReturnType<
      typeof AccessibilityInfo.addEventListener
    >);
  const view = await render(<TabBarSurface />);
  await view.unmount();
  await act(async () => resolveRead?.(false));
  expect(remove).toHaveBeenCalledTimes(1);
});

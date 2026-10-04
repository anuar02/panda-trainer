import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Text, Pressable } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { CalmModeProvider, useCalmModePreference } from '../src/ui/calm-mode';

import {
  cancelAnimation,
  withDelay,
  withRepeat,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import {
  MotionPolicyProvider,
  MotionScrollView,
  MotionHeader,
  MotionPressable,
  Shimmer,
  PulseDot,
  entranceDelay,
  motion,
  TabMotion,
} from '../src/ui/motion';

afterEach(() => jest.restoreAllMocks());
test('CSS stagger saturates after the sixth body block', () => {
  expect(Array.from({ length: 8 }, (_, i) => entranceDelay(i))).toEqual([
    40, 100, 160, 220, 280, 340, 400, 400,
  ]);
  expect(motion.buttonScale).toBe(0.96);
  expect(motion.chipScale).toBe(0.94);
  expect(motion.rowScale).toBe(0.985);
});
test('rapid press reversal always returns to resting scale', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const view = await render(
    <MotionPressable testID="tap" motionKind="button">
      <Text>Tap</Text>
    </MotionPressable>,
  );
  jest.mocked(withTiming).mockClear();
  await fireEvent(view.getByTestId('tap'), 'pressIn');
  await fireEvent(view.getByTestId('tap'), 'pressOut');
  await fireEvent(view.getByTestId('tap'), 'pressIn');
  await fireEvent(view.getByTestId('tap'), 'pressOut');
  expect(jest.mocked(withTiming).mock.calls.map((call) => call[0])).toEqual([
    0.96, 1, 0.96, 1,
  ]);
});

jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

function CalmSwitch() {
  const { setCalmMode } = useCalmModePreference();
  return <Pressable testID="calm" onPress={() => setCalmMode(true)} />;
}
test('focus replay occurs on returning, while data rerenders do not restart entrance', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const listeners = new Map<string, () => void>();
  const navigation = {
    isFocused: () => true,
    addListener: (event: string, callback: () => void) => {
      listeners.set(event, callback);
      return () => listeners.delete(event);
    },
  } as unknown as React.ContextType<typeof NavigationContext>;
  const content = (text: string) => (
    <NavigationContext.Provider value={navigation}>
      <MotionPolicyProvider>
        <MotionScrollView>
          <Text>{text}</Text>
          <Text>Second</Text>
        </MotionScrollView>
      </MotionPolicyProvider>
    </NavigationContext.Provider>
  );
  const view = await render(content('First'));
  expect(withDelay).toHaveBeenCalledWith(
    40,
    expect.anything(),
    expect.anything(),
  );
  expect(withDelay).toHaveBeenCalledWith(
    100,
    expect.anything(),
    expect.anything(),
  );
  jest.mocked(withTiming).mockClear();
  await view.rerender(content('Updated data'));
  expect(withTiming).not.toHaveBeenCalled();
  await act(async () => listeners.get('blur')?.());
  expect(withTiming).not.toHaveBeenCalled();
  await act(async () => listeners.get('focus')?.());
  expect(withTiming).toHaveBeenCalledTimes(2);
  await view.unmount();
  expect(listeners.size).toBe(0);
});
test('calm change stops entrance, presses and continuous motion immediately', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const view = await render(
    <CalmModeProvider role="trainer">
      <MotionPolicyProvider>
        <CalmSwitch />
        <MotionScrollView>
          <Text>Content</Text>
        </MotionScrollView>
        <MotionPressable testID="button" motionKind="button" />
        <Shimmer testID="skeleton" />
        <PulseDot color="#0f0" pulse />
      </MotionPolicyProvider>
    </CalmModeProvider>,
  );
  expect(withRepeat).toHaveBeenCalled();
  jest.mocked(withTiming).mockClear();
  jest.mocked(cancelAnimation).mockClear();
  await fireEvent.press(view.getByTestId('calm'));
  expect(cancelAnimation).toHaveBeenCalled();
  expect(withTiming).not.toHaveBeenCalled();
  await fireEvent(view.getByTestId('button'), 'pressIn');
  expect(withTiming).not.toHaveBeenCalled();
  expect(view.getByText('Content')).toBeVisible();
});

test('system snapshot skips entrance, tabPop, pulse and shimmer before the async read', async () => {
  jest.mocked(useReducedMotion).mockReturnValue(true);
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  jest.mocked(withTiming).mockClear();
  jest.mocked(withRepeat).mockClear();
  const view = await render(
    <MotionPolicyProvider>
      <MotionScrollView>
        <Text>Immediate</Text>
      </MotionScrollView>
      <TabMotion selected />
      <Shimmer />
      <PulseDot color="#0f0" pulse />
    </MotionPolicyProvider>,
  );
  expect(withTiming).not.toHaveBeenCalled();
  expect(withRepeat).not.toHaveBeenCalled();
  expect(view.getByText('Immediate')).toBeVisible();
  await view.unmount();
  jest.mocked(useReducedMotion).mockReturnValue(false);
});
test('tabPop repeats when stack focus revision changes', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const view = await render(
    <MotionPolicyProvider>
      <TabMotion selected revision="1" />
    </MotionPolicyProvider>,
  );
  jest.mocked(withTiming).mockClear();
  await view.rerender(
    <MotionPolicyProvider>
      <TabMotion selected revision="2" />
    </MotionPolicyProvider>,
  );
  expect(withTiming).toHaveBeenCalledWith(
    1.18,
    expect.objectContaining({ duration: 360 }),
  );
  expect(withTiming).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ duration: 240 }),
  );
});

test('scenario key replays header and body while ordinary content changes do not', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const content = (key: string, text: string) => (
    <MotionPolicyProvider>
      <MotionHeader motionKey={key}>
        <Text>Header</Text>
      </MotionHeader>
      <MotionScrollView motionKey={key}>
        <Text>{text}</Text>
      </MotionScrollView>
    </MotionPolicyProvider>
  );
  const view = await render(content('normal', 'First'));
  jest.mocked(withTiming).mockClear();
  await view.rerender(content('normal', 'Updated'));
  expect(withTiming).not.toHaveBeenCalled();
  await view.rerender(content('loading', 'Loading'));
  expect(withTiming).toHaveBeenCalledTimes(2);
});

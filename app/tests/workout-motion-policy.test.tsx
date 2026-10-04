import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Pressable, Text } from 'react-native';
import {
  withTiming,
  withRepeat,
  cancelAnimation,
} from 'react-native-reanimated';
import { MotionPolicyProvider } from '../src/ui/motion';
import { CalmModeProvider, useCalmModePreference } from '../src/ui/calm-mode';
import {
  WorkoutEffect,
  WorkoutHoldMotion,
  WorkoutRestFill,
} from '../src/features/workout/workout-motion';
function Switch() {
  const { setCalmMode } = useCalmModePreference();
  return <Pressable testID="calm" onPress={() => setCalmMode(true)} />;
}
afterEach(() => jest.restoreAllMocks());
test('live calm cancels an active dock and preserves immediately visible hold content and rest width', async () => {
  const view = await render(
    <CalmModeProvider role="trainer">
      <MotionPolicyProvider>
        <Switch />
        <WorkoutEffect kind="dock" active>
          <Text>Rest</Text>
        </WorkoutEffect>
        <WorkoutHoldMotion visible testID="hold">
          <Text>Hold</Text>
        </WorkoutHoldMotion>
        <WorkoutRestFill progress={65} testID="fill" />
      </MotionPolicyProvider>
    </CalmModeProvider>,
  );
  expect(withRepeat).toHaveBeenCalled();
  jest.mocked(withTiming).mockClear();
  jest.mocked(cancelAnimation).mockClear();
  await fireEvent.press(view.getByTestId('calm'));
  expect(cancelAnimation).toHaveBeenCalled();
  expect(withTiming).not.toHaveBeenCalled();
  expect(view.getByTestId('hold')).toHaveStyle({
    opacity: 1,
    transform: [{ translateY: 0 }],
  });
  expect(view.getByTestId('fill')).toHaveStyle({ width: '65%' });
  expect(view.getByText('Rest')).toBeOnTheScreen();
});
test('live system reduce cancels loops and keeps data visible without a completion timer', async () => {
  let change: (value: boolean) => void = () => {};
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((_, listener) => {
      change = listener as unknown as (value: boolean) => void;
      return { remove: jest.fn() } as unknown as ReturnType<
        typeof AccessibilityInfo.addEventListener
      >;
    });
  const content = (visible: boolean) => (
    <MotionPolicyProvider>
      <WorkoutEffect kind="dock">
        <Text>Rest</Text>
      </WorkoutEffect>
      <WorkoutHoldMotion visible={visible}>
        <Text>Hold</Text>
      </WorkoutHoldMotion>
    </MotionPolicyProvider>
  );
  const view = await render(content(true));
  jest.mocked(withTiming).mockClear();
  await act(async () => change(true));
  expect(withTiming).not.toHaveBeenCalled();
  await view.rerender(content(false));
  expect(view.queryByText('Hold')).toBeNull();
  expect(view.getByText('Rest')).toBeOnTheScreen();
});

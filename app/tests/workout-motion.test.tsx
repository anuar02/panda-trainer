import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import {
  cancelAnimation,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  WorkoutEffect,
  WorkoutStep,
  WorkoutRestFill,
  WorkoutHoldMotion,
  useNewWorkoutExercises,
} from '../src/features/workout/workout-motion';

let mockDisabled = false;
jest.mock('../src/ui/motion', () => ({
  ...jest.requireActual('../src/ui/motion'),
  useMotionDisabled: () => mockDisabled,
}));
beforeEach(() => {
  mockDisabled = false;
  jest.clearAllMocks();
});
test('recorded feedback only follows a new set, never hydration, typing or edits', async () => {
  const view = await render(
    <WorkoutEffect kind="recorded" revision={3}>
      <Text>Saved</Text>
    </WorkoutEffect>,
  );
  expect(withTiming).not.toHaveBeenCalled();
  await view.rerender(
    <WorkoutEffect kind="recorded" revision={4}>
      <Text>Next</Text>
    </WorkoutEffect>,
  );
  expect(withTiming).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ duration: 200 }),
  );
  jest.mocked(withTiming).mockClear();
  await view.rerender(
    <WorkoutEffect kind="recorded" revision={4}>
      <Text>Edited</Text>
    </WorkoutEffect>,
  );
  expect(withTiming).not.toHaveBeenCalled();
  await view.rerender(
    <WorkoutEffect kind="recorded" revision={2}>
      <Text>Undo</Text>
    </WorkoutEffect>,
  );
  expect(withTiming).not.toHaveBeenCalled();
});
test('new exercises are scoped to an existing participant and do not replay on input', async () => {
  function Probe({ scope, ids }: { scope: string; ids: string[] }) {
    const fresh = useNewWorkoutExercises(scope, ids);
    return <Text testID="fresh">{fresh ?? 'none'}</Text>;
  }
  const view = await render(<Probe scope="s:c" ids={['a']} />);
  expect(view.getByTestId('fresh')).toHaveTextContent('none');
  await view.rerender(<Probe scope="s:c" ids={['a', 'b']} />);
  expect(view.getByTestId('fresh')).toHaveTextContent('b');
  await view.rerender(<Probe scope="s:c" ids={['a', 'b']} />);
  expect(view.getByTestId('fresh')).toHaveTextContent('b');
  await view.rerender(<Probe scope="s:d" ids={['z']} />);
  expect(view.getByTestId('fresh')).toHaveTextContent('none');
});
test('step presses are reversible and dispatch without waiting for movement', async () => {
  const press = jest.fn();
  const view = await render(
    <WorkoutStep accessibilityLabel="Plus" onPress={press}>
      <Text>+</Text>
    </WorkoutStep>,
  );
  await fireEvent(view.getByLabelText('Plus'), 'pressIn');
  expect(withTiming).toHaveBeenLastCalledWith(
    0.88,
    expect.objectContaining({ duration: 150 }),
  );
  await fireEvent.press(view.getByLabelText('Plus'));
  expect(press).toHaveBeenCalledTimes(1);
  await fireEvent(view.getByLabelText('Plus'), 'pressOut');
  expect(withTiming).toHaveBeenLastCalledWith(
    1,
    expect.objectContaining({ duration: 150 }),
  );
});
test('rest progress transitions linearly and calm cancels loops with immediate final state', async () => {
  const view = await render(<WorkoutRestFill progress={20} testID="fill" />);
  jest.mocked(withTiming).mockClear();
  await view.rerender(<WorkoutRestFill progress={40} testID="fill" />);
  expect(withTiming).toHaveBeenCalledWith(
    40,
    expect.objectContaining({ duration: 500 }),
  );
  await view.rerender(
    <WorkoutEffect kind="dock" active>
      <Text>Rest</Text>
    </WorkoutEffect>,
  );
  expect(withRepeat).toHaveBeenCalled();
  mockDisabled = true;
  jest.mocked(withTiming).mockClear();
  await view.rerender(
    <WorkoutEffect kind="dock" active>
      <Text>Rest</Text>
    </WorkoutEffect>,
  );
  expect(cancelAnimation).toHaveBeenCalled();
  expect(withTiming).not.toHaveBeenCalled();
});
test('hold reverses leaving immediately and reduced motion removes without a delay', async () => {
  const view = await render(
    <WorkoutHoldMotion visible>
      <Text>Hold</Text>
    </WorkoutHoldMotion>,
  );
  await view.rerender(
    <WorkoutHoldMotion visible={false}>
      <Text>Hold</Text>
    </WorkoutHoldMotion>,
  );
  expect(withTiming).toHaveBeenCalledWith(
    0,
    expect.objectContaining({ duration: 250 }),
    expect.any(Function),
  );
  await view.rerender(
    <WorkoutHoldMotion visible>
      <Text>Hold</Text>
    </WorkoutHoldMotion>,
  );
  expect(view.getByText('Hold')).toBeOnTheScreen();
  expect(withTiming).toHaveBeenLastCalledWith(
    1,
    expect.objectContaining({ duration: 350 }),
  );
  mockDisabled = true;
  await act(async () =>
    view.rerender(
      <WorkoutHoldMotion visible={false}>
        <Text>Hold</Text>
      </WorkoutHoldMotion>,
    ),
  );
  expect(view.queryByText('Hold')).toBeNull();
});

test('new highlight runs once and does not replay when selecting the exercise again', async () => {
  const content = (active: boolean) => (
    <WorkoutEffect kind="new" active={active} revision="s:c:new">
      <Text>Exercise</Text>
    </WorkoutEffect>
  );
  const view = await render(content(false));
  jest.mocked(withTiming).mockClear();
  await view.rerender(content(true));
  expect(withTiming).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ duration: 1200 }),
  );
  await view.rerender(content(false));
  jest.mocked(withTiming).mockClear();
  await view.rerender(content(true));
  expect(withTiming).not.toHaveBeenCalled();
});
test('rest finished pulse occurs on completion, never when hydrating an already finished rest', async () => {
  const view = await render(
    <WorkoutEffect kind="rest-finished" active testID="rest">
      <Text>Done</Text>
    </WorkoutEffect>,
  );
  expect(view.getByTestId('rest')).toHaveStyle({ opacity: 1 });
  expect(withTiming).not.toHaveBeenCalled();
  await view.rerender(
    <WorkoutEffect kind="rest-finished" active={false} testID="rest">
      <Text>Rest</Text>
    </WorkoutEffect>,
  );
  await view.rerender(
    <WorkoutEffect kind="rest-finished" active testID="rest">
      <Text>Done</Text>
    </WorkoutEffect>,
  );
  expect(withTiming).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ duration: 200 }),
  );
  expect(withTiming).toHaveBeenCalledWith(
    0,
    expect.objectContaining({ duration: 200 }),
  );
});
test.each([
  'bubble',
  'voice-item',
  'mic',
  'hold-mic',
  'mic-hint',
  'bar',
] as const)(
  'reduced motion keeps %s final and never schedules a loop',
  async (kind) => {
    mockDisabled = true;
    const view = await render(
      <WorkoutEffect kind={kind}>
        <Text>Visible</Text>
      </WorkoutEffect>,
    );
    expect(view.getByText('Visible')).toBeOnTheScreen();
    expect(withTiming).not.toHaveBeenCalled();
    expect(withRepeat).not.toHaveBeenCalled();
  },
);

test('a late hold completion cannot remove a reentered layer', async () => {
  const view = await render(
    <WorkoutHoldMotion visible>
      <Text>Hold</Text>
    </WorkoutHoldMotion>,
  );
  await view.rerender(
    <WorkoutHoldMotion visible={false}>
      <Text>Hold</Text>
    </WorkoutHoldMotion>,
  );
  const finish = jest
    .mocked(withTiming)
    .mock.calls.findLast((call) => call[1]?.duration === 250 && call[2])?.[2];
  expect(finish).toBeDefined();
  await view.rerender(
    <WorkoutHoldMotion visible>
      <Text>Hold</Text>
    </WorkoutHoldMotion>,
  );
  await act(async () => finish?.(true, 0));
  expect(view.getByText('Hold')).toBeOnTheScreen();
  await view.rerender(
    <WorkoutHoldMotion visible={false}>
      <Text>Hold</Text>
    </WorkoutHoldMotion>,
  );
  const lastFinish = jest
    .mocked(withTiming)
    .mock.calls.findLast((call) => call[1]?.duration === 250 && call[2])?.[2];
  await act(async () => lastFinish?.(true, 0));
  expect(view.queryByText('Hold')).toBeNull();
});

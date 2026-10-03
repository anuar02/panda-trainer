import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
import { ReduceMotion, withTiming } from 'react-native-reanimated';
import { MotionView, useSystemReduceMotion } from '../src/ui/motion';
function Probe() {
  const reduced = useSystemReduceMotion();
  return <Text testID="reduced">{String(reduced)}</Text>;
}
afterEach(() => jest.restoreAllMocks());
test('system change wins over a pending initial read and subscriptions are removed', async () => {
  let resolve: (value: boolean) => void = () => {};
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const remove = jest.fn();
  const subscription = jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove } as unknown as ReturnType<
      typeof AccessibilityInfo.addEventListener
    >);
  const view = await render(<Probe />);
  const change = (
    subscription.mock.calls.at(-1) as unknown as [
      string,
      (value: boolean) => void,
    ]
  )[1];
  expect(screen.getByTestId('reduced')).toHaveTextContent('true');
  await act(async () => change(true));
  await act(async () => resolve(false));
  expect(screen.getByTestId('reduced')).toHaveTextContent('true');
  await act(async () => change(false));
  expect(screen.getByTestId('reduced')).toHaveTextContent('false');
  await view.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
test('motion policy skips animations in reduced mode and uses ReduceMotion.System when recording changes', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  jest.mocked(withTiming).mockClear();
  const view = await render(
    <MotionView recorded revision="50:10">
      <Text>Saved</Text>
    </MotionView>,
  );
  expect(withTiming).not.toHaveBeenCalled();
  await view.unmount();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const normal = await render(
    <MotionView recorded>
      <Text>Empty</Text>
    </MotionView>,
  );
  expect(withTiming).not.toHaveBeenCalled();
  await normal.rerender(
    <MotionView recorded revision="60:10">
      <Text>Saved</Text>
    </MotionView>,
  );
  expect(withTiming).toHaveBeenCalledWith(
    1,
    expect.objectContaining({
      duration: 200,
      reduceMotion: ReduceMotion.System,
    }),
  );
});

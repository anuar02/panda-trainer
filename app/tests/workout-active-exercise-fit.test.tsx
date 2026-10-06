import { act, render } from '@testing-library/react-native';
import { View } from 'react-native';
import {
  getActiveExerciseFit,
  getActiveComposerLayout,
  useActiveExerciseAlignment,
} from '../src/features/workout/active-exercise-layout';

test.each([
  [393, 852, 59, 34, 573],
  [375, 667, 20, 0, 461],
])(
  'compact exercise fits %sx%s between safe header and dock',
  (_, height, top, bottom, viewport) => {
    expect(height - top - bottom - 56 - 130).toBe(viewport);
    expect(getActiveExerciseFit(viewport, 152, 284)).toEqual({
      fits: true,
      metadataHeight: 152,
      cardHeight: 454,
    });
    expect(getActiveExerciseFit(viewport, 480, 330)).toEqual({
      fits: false,
      metadataHeight: viewport - 348,
      cardHeight: viewport,
    });
  },
);

test('alignment follows focus and set events, waits for manual scrolling, and respects reduced motion', async () => {
  jest.useFakeTimers();
  const scrollTo = jest.fn();
  function Probe({
    event,
    reduced = false,
  }: {
    event: string;
    reduced?: boolean;
  }) {
    const alignment = useActiveExerciseAlignment(event, reduced, scrollTo);
    return <View testID="probe" {...alignment} />;
  }
  const view = await render(<Probe event="s:c:a:0" />);
  await act(() => view.getByTestId('probe').props.onPosition(120));
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 120, animated: true });
  scrollTo.mockClear();
  await view.rerender(<Probe event="s:c:a:0" />);
  await act(() => view.getByTestId('probe').props.onPosition(140));
  expect(scrollTo).not.toHaveBeenCalled();
  await act(() => view.getByTestId('probe').props.onScrollBeginDrag());
  await view.rerender(<Probe event="s:c:b:0" />);
  expect(scrollTo).not.toHaveBeenCalled();
  await act(() => view.getByTestId('probe').props.onScrollEndDrag());
  await act(() => view.getByTestId('probe').props.onMomentumScrollBegin());
  await act(() => jest.advanceTimersByTime(150));
  expect(scrollTo).not.toHaveBeenCalled();
  await act(() => view.getByTestId('probe').props.onMomentumScrollEnd());
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 140, animated: true });
  await view.rerender(<Probe event="s:c:b:1" reduced />);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 140, animated: false });
  jest.useRealTimers();
});

test('large text reserves metadata and compacts labels before the pinned input exceeds its budget', () => {
  expect(getActiveComposerLayout(2, 467)).toEqual({
    compact: false,
    estimatedHeight: 259.55,
  });
  expect(getActiveComposerLayout(2, 300)).toEqual({
    compact: true,
    estimatedHeight: 199.85,
  });
  expect(
    getActiveExerciseFit(
      300,
      480,
      getActiveComposerLayout(2, 300).estimatedHeight,
    ).metadataHeight,
  ).toBeCloseTo(82.15);
});

import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Pressable } from 'react-native';
import { ToastProvider, useToast } from '../src/ui/toast';
import { tokens } from '../src/ui/theme';
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
function Probe() {
  const show = useToast();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="first"
        onPress={() => show('Первое')}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="second"
        onPress={() => show('Второе')}
      />
    </>
  );
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
test('shows, announces, replaces and expires messages from the latest trigger', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const view = await render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
  );
  await fireEvent.press(view.getByRole('button', { name: 'first' }));
  expect(view.getByText('Первое')).toBeOnTheScreen();
  expect(announce).toHaveBeenNthCalledWith(1, 'Первое');
  await act(async () => jest.advanceTimersByTime(tokens.duration.toast - 1));
  await fireEvent.press(view.getByRole('button', { name: 'second' }));
  expect(view.queryByText('Первое')).toBeNull();
  expect(announce).toHaveBeenNthCalledWith(2, 'Второе');
  await act(async () => jest.advanceTimersByTime(1));
  expect(view.getByText('Второе')).toBeOnTheScreen();
  await act(async () => jest.advanceTimersByTime(tokens.duration.toast - 1));
  expect(view.queryByText('Второе')).toBeNull();
});

import { act, fireEvent, render } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import type { PropsWithChildren, Ref } from 'react';
import '../src/lib/i18n';
import { Sheet } from '../src/ui/sheet';
const mockPresent = jest.fn();
const mockDismiss = jest.fn();
let mockOnDismiss: () => void;
let mockOnBlur: () => void;
let mockFocused = true;
const mockNavigation = {
  isFocused: () => mockFocused,
  addListener: jest.fn((event: string, listener: () => void) => {
    if (event === 'blur') mockOnBlur = listener;
    return jest.fn();
  }),
};
jest.mock('expo-router', () => ({ useNavigation: () => mockNavigation }));
jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BottomSheetModal: ({
      children,
      ref,
      onDismiss,
    }: PropsWithChildren<{
      ref: Ref<{ present: () => void; dismiss: () => void }>;
      onDismiss: () => void;
    }>) => {
      React.useImperativeHandle(ref, () => ({
        present: mockPresent,
        dismiss: mockDismiss,
      }));
      mockOnDismiss = onDismiss;
      return children;
    },
    BottomSheetScrollView: View,
    BottomSheetBackdrop: () => null,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
});
test('does not dismiss a modal before its first presentation', async () => {
  const onClose = jest.fn();
  const view = await render(
    <Sheet open={false} title="Шторка" onClose={onClose} />,
  );
  expect(mockDismiss).not.toHaveBeenCalled();
  await view.rerender(<Sheet open title="Шторка" onClose={onClose} />);
  expect(mockPresent).toHaveBeenCalledTimes(1);
  await view.rerender(<Sheet open={false} title="Шторка" onClose={onClose} />);
  expect(mockDismiss).toHaveBeenCalledTimes(1);
  await act(async () => mockOnDismiss());
  expect(onClose).not.toHaveBeenCalled();
  await view.rerender(<Sheet open title="Шторка" onClose={onClose} />);
  expect(mockPresent).toHaveBeenCalledTimes(2);
});
test('reopens after gesture dismissal without dismissing the unmounted modal again', async () => {
  const onClose = jest.fn();
  const view = await render(<Sheet open title="Шторка" onClose={onClose} />);
  await act(async () => mockOnDismiss());
  expect(onClose).toHaveBeenCalledTimes(1);
  await view.rerender(<Sheet open={false} title="Шторка" onClose={onClose} />);
  expect(mockDismiss).not.toHaveBeenCalled();
  await view.rerender(<Sheet open title="Шторка" onClose={onClose} />);
  expect(mockPresent).toHaveBeenCalledTimes(2);
});
test.each(['button', 'back'])(
  'closes once through %s and reopens',
  async (trigger) => {
    const onClose = jest.fn();
    let onBack: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
    const remove = jest.fn();
    const subscription = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((event, handler) => {
        onBack = handler;
        return { remove };
      });
    const view = await render(<Sheet open title="Шторка" onClose={onClose} />);
    if (trigger === 'button') {
      await fireEvent.press(view.getByRole('button', { name: 'Закрыть' }));
    } else {
      await act(async () => {
        expect(onBack?.({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(
          true,
        );
      });
    }
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => mockOnDismiss());
    expect(onClose).toHaveBeenCalledTimes(1);
    await view.rerender(
      <Sheet open={false} title="Шторка" onClose={onClose} />,
    );
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    await view.rerender(<Sheet open title="Шторка" onClose={onClose} />);
    expect(mockPresent).toHaveBeenCalledTimes(2);
    subscription.mockRestore();
  },
);
test('route blur dismisses the owned modal and notifies only once', async () => {
  const onClose = jest.fn();
  const view = await render(<Sheet open title="Шторка" onClose={onClose} />);
  await act(async () => {
    mockFocused = false;
    mockOnBlur();
  });
  expect(mockDismiss).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  await act(async () => mockOnDismiss());
  expect(onClose).toHaveBeenCalledTimes(1);
  await view.rerender(<Sheet open={false} title="Шторка" onClose={onClose} />);
  mockFocused = true;
  await view.rerender(<Sheet open={false} title="Шторка" onClose={onClose} />);
  expect(mockPresent).toHaveBeenCalledTimes(1);
  await view.rerender(<Sheet open title="Шторка" onClose={onClose} />);
  expect(mockPresent).toHaveBeenCalledTimes(2);
});

test('unmount dismisses the portal without firing a stale close callback', async () => {
  const onClose = jest.fn();
  const view = await render(<Sheet open title="Шторка" onClose={onClose} />);
  await view.unmount();
  expect(mockDismiss).toHaveBeenCalledTimes(1);
  await act(async () => mockOnDismiss());
  expect(onClose).not.toHaveBeenCalled();
});

test('an unfocused owner never presents a new modal', async () => {
  mockFocused = false;
  await render(<Sheet open title="Шторка" onClose={jest.fn()} />);
  expect(mockPresent).not.toHaveBeenCalled();
  expect(mockDismiss).not.toHaveBeenCalled();
});

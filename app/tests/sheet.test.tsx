import { act, render } from '@testing-library/react-native';
import type { PropsWithChildren, Ref } from 'react';
import '../src/lib/i18n';
import { Sheet } from '../src/ui/sheet';

const mockPresent = jest.fn();
const mockDismiss = jest.fn();
let mockOnDismiss: () => void;

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

beforeEach(() => jest.clearAllMocks());

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
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('reopens after gesture dismissal without dismissing the unmounted modal again', async () => {
  const onClose = jest.fn();
  const view = await render(<Sheet open title="Шторка" onClose={onClose} />);
  await act(async () => mockOnDismiss());
  await view.rerender(<Sheet open={false} title="Шторка" onClose={onClose} />);
  expect(mockDismiss).not.toHaveBeenCalled();
  await view.rerender(<Sheet open title="Шторка" onClose={onClose} />);
  expect(mockPresent).toHaveBeenCalledTimes(2);
});

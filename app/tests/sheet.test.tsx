import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react-native';
import {
  AccessibilityInfo,
  BackHandler,
  Dimensions,
  Text,
  Pressable,
} from 'react-native';
import { ReduceMotion } from 'react-native-reanimated';
import type { PropsWithChildren, Ref } from 'react';
import '../src/lib/i18n';
import { CalmModeProvider, useCalmModePreference } from '../src/ui/calm-mode';
import { Sheet } from '../src/ui/sheet';
const mockPresent = jest.fn();
const mockDismiss = jest.fn();
let mockOnDismiss: () => void;
let mockOnBlur: () => void;
let mockFocused = true;
let mockStackBehavior: string | undefined;
let mockReduceMotion: string | undefined;
let mockAnimationDuration: number | undefined;
const mockNavigation = {
  isFocused: () => mockFocused,
  addListener: jest.fn((event: string, listener: () => void) => {
    if (event === 'blur') mockOnBlur = listener;
    return jest.fn();
  }),
};
const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');
const normalWindow = { ...originalWindow, height: 800, fontScale: 1 };
const normalScreen = { ...originalScreen, height: 800, fontScale: 1 };
function setDimensions(patch: { height?: number; fontScale?: number }) {
  Dimensions.set({
    window: { ...normalWindow, ...patch },
    screen: { ...normalScreen, ...patch },
  });
}
jest.mock('expo-router', () => ({ useNavigation: () => mockNavigation }));
jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ScrollView = ({ children }: PropsWithChildren) => (
    <View testID="sheet-scroll-view">{children}</View>
  );
  return {
    BottomSheetModal: ({
      children,
      ref,
      onDismiss,
      accessible,
      stackBehavior,
      overrideReduceMotion,
      animationConfigs,
    }: PropsWithChildren<{
      ref: Ref<{ present: () => void; dismiss: () => void }>;
      onDismiss: () => void;
      accessible?: boolean;
      stackBehavior?: string;
      overrideReduceMotion?: string;
      animationConfigs?: { duration: number };
    }>) => {
      React.useImperativeHandle(ref, () => ({
        present: mockPresent,
        dismiss: mockDismiss,
      }));
      mockOnDismiss = onDismiss;
      mockStackBehavior = stackBehavior;
      mockReduceMotion = overrideReduceMotion;
      mockAnimationDuration = animationConfigs?.duration;
      return (
        <View testID="sheet-content" accessible={accessible ?? true}>
          {children}
        </View>
      );
    },
    BottomSheetScrollView: ScrollView,
    BottomSheetBackdrop: () => null,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  setDimensions({});
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

test('fixed content stays outside the scroll area and omits the generic close action', async () => {
  await render(
    <Sheet
      open
      title="Добавить упражнения"
      onClose={jest.fn()}
      fixedContent={{
        header: (
          <>
            <Text>Hint</Text>
            <Text>Search</Text>
          </>
        ),
        footer: <Text>Done</Text>,
      }}
    >
      <Text>Results</Text>
    </Sheet>,
  );
  expect(screen.getByTestId('sheet-content')).toHaveProp('accessible', false);
  const scroll = screen.getByTestId('sheet-scroll-view');
  expect(within(scroll).getByText('Results')).toBeTruthy();
  expect(within(scroll).queryByText('Hint')).toBeNull();
  expect(within(scroll).queryByText('Search')).toBeNull();
  expect(within(scroll).queryByText('Done')).toBeNull();
  expect(screen.getByText('Hint')).toBeTruthy();
  expect(screen.getByText('Search')).toBeTruthy();
  expect(screen.getByText('Done')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull();
});

test.each([
  ['large font scale', { fontScale: 1.6 }],
  ['short window', { height: 500 }],
])(
  'scrolls the fixed header with results for %s and restores it afterward',
  async (_, compact) => {
    await render(
      <Sheet
        open
        title="Добавить упражнения"
        onClose={jest.fn()}
        fixedContent={{
          header: (
            <>
              <Text testID="picker-hint">Hint</Text>
              <Text testID="picker-search">Search</Text>
            </>
          ),
          footer: <Text testID="picker-done">Done</Text>,
        }}
      >
        <Text testID="picker-results">Results</Text>
      </Sheet>,
    );
    const scroll = screen.getByTestId('sheet-scroll-view');
    expect(within(scroll).queryByTestId('picker-hint')).toBeNull();
    expect(within(scroll).queryByTestId('picker-search')).toBeNull();
    expect(within(scroll).getByTestId('picker-results')).toBeTruthy();
    expect(screen.getByTestId('picker-done')).toBeTruthy();

    await act(async () => setDimensions(compact));
    expect(within(scroll).getByText('Добавить упражнения')).toBeTruthy();
    expect(within(scroll).getByTestId('picker-hint')).toBeTruthy();
    expect(within(scroll).getByTestId('picker-search')).toBeTruthy();
    expect(within(scroll).getByTestId('picker-results')).toBeTruthy();
    expect(within(scroll).queryByTestId('picker-done')).toBeNull();
    expect(screen.getByTestId('picker-done')).toBeTruthy();

    await act(async () => setDimensions({}));
    expect(within(scroll).queryByText('Добавить упражнения')).toBeNull();
    expect(within(scroll).queryByTestId('picker-hint')).toBeNull();
    expect(within(scroll).queryByTestId('picker-search')).toBeNull();
    expect(within(scroll).getByTestId('picker-results')).toBeTruthy();
    expect(screen.getByText('Добавить упражнения')).toBeTruthy();
    expect(screen.getByTestId('picker-done')).toBeTruthy();
  },
);

test('nested push preserves the library default for existing sheet callers', async () => {
  const onClose = jest.fn();
  const view = await render(<Sheet open title="Parent" onClose={onClose} />);
  expect(mockStackBehavior).toBeUndefined();
  await view.rerender(
    <Sheet open title="Editor" onClose={onClose} stackBehavior="push" />,
  );
  expect(mockStackBehavior).toBe('push');
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => mockOnDismiss());
  expect(onClose).toHaveBeenCalledTimes(1);
});

test.each([true, false])(
  'sheet forwards system reduceMotion=%s with prototype timing',
  async (reduced) => {
    const setting = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(reduced);
    try {
      await render(<Sheet open title="Шторка" onClose={jest.fn()} />);
      await waitFor(() =>
        expect(mockReduceMotion).toBe(
          reduced ? ReduceMotion.Always : ReduceMotion.System,
        ),
      );
      expect(mockAnimationDuration).toBe(420);
    } finally {
      setting.mockRestore();
    }
  },
);

test('calm disables sheet movement and the set editor has no spatial entrance', async () => {
  const view = await render(
    <Sheet open title="Editor" immediate onClose={jest.fn()} />,
  );
  expect(mockReduceMotion).toBe(ReduceMotion.Always);
  await view.rerender(<Sheet open title="Menu" onClose={jest.fn()} />);
  expect(mockReduceMotion).toBe(ReduceMotion.System);
});

function CalmSheetSwitch() {
  const { setCalmMode } = useCalmModePreference();
  return <Pressable testID="sheet-calm" onPress={() => setCalmMode(true)} />;
}
test('live calm uses the same immediate policy as system reduced motion', async () => {
  const view = await render(
    <CalmModeProvider role="trainer">
      <CalmSheetSwitch />
      <Sheet open title="Menu" onClose={jest.fn()} />
    </CalmModeProvider>,
  );
  expect(mockReduceMotion).toBe(ReduceMotion.System);
  await fireEvent.press(view.getByTestId('sheet-calm'));
  expect(mockReduceMotion).toBe(ReduceMotion.Always);
});

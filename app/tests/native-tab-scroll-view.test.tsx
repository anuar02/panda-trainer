import { createRef } from 'react';
import { render } from '@testing-library/react-native';
import { Platform, ScrollView, Text, View } from 'react-native';
import { ScrollViewMarker } from 'react-native-screens/experimental';
import { NativeTabScrollView } from '../src/features/navigation/native-tab-scroll-view';
import { NativeTabsInsetsProvider } from '../src/features/navigation/tab-bar-layout';

jest.mock('react-native-screens/experimental', () => ({
  ScrollViewMarker: jest.fn(({ children, style }) => {
    const { View: MarkerView } = jest.requireActual('react-native');
    return (
      <MarkerView testID="scroll-marker" style={style}>
        {children}
      </MarkerView>
    );
  }),
}));

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('iOS registers the direct list after a header and preserves props, ref and identity', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const ref = createRef<ScrollView>();
  const onScroll = jest.fn();
  const style = { backgroundColor: 'red' };
  const contentContainerStyle = { paddingBottom: 12 };
  const tree = (motionKey: string) => (
    <NativeTabsInsetsProvider>
      <View>
        <Text>Header</Text>
        <NativeTabScrollView
          ref={ref}
          testID="primary-list"
          style={style}
          contentContainerStyle={contentContainerStyle}
          onScroll={onScroll}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          motionKey={motionKey}
        >
          <Text>{motionKey}</Text>
        </NativeTabScrollView>
      </View>
    </NativeTabsInsetsProvider>
  );
  const view = await render(tree('initial'));
  const list = view.getByTestId('primary-list');
  const initialRef = ref.current;
  expect(view.getByTestId('scroll-marker')).toHaveStyle({ flex: 1 });
  expect(list.parent?.props.testID).toBe('scroll-marker');
  expect(list.props.contentInsetAdjustmentBehavior).toBe('automatic');
  expect(list.props.style).toEqual(style);
  expect(list.props.contentContainerStyle).toEqual(contentContainerStyle);
  expect(list.props.keyboardShouldPersistTaps).toBe('handled');
  expect(list.props.onScroll).toBe(onScroll);
  expect(initialRef).not.toBeNull();
  expect(ScrollViewMarker).toHaveBeenCalled();
  await view.rerender(tree('next'));
  expect(ref.current).toBe(initialRef);
  expect(view.getByText('next')).toBeTruthy();
  await view.unmount();
  expect(ref.current).toBeNull();
});

test.each([
  ['ios', false],
  ['android', true],
  ['web', true],
] as const)(
  '%s with native provider %s preserves scroll behavior',
  async (os, nativeTabs) => {
    jest.replaceProperty(Platform, 'OS', os);
    const list = (
      <NativeTabScrollView
        testID="primary-list"
        contentInsetAdjustmentBehavior="never"
      >
        <Text>Final action</Text>
      </NativeTabScrollView>
    );
    const view = await render(
      nativeTabs ? (
        <NativeTabsInsetsProvider>{list}</NativeTabsInsetsProvider>
      ) : (
        list
      ),
    );
    expect(view.queryByTestId('scroll-marker')).toBeNull();
    expect(
      view.getByTestId('primary-list').props.contentInsetAdjustmentBehavior,
    ).toBe('never');
    expect(ScrollViewMarker).not.toHaveBeenCalled();
  },
);

test('nested horizontal lists are not native scroll targets', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const view = await render(
    <NativeTabsInsetsProvider>
      <NativeTabScrollView
        horizontal
        testID="horizontal"
        contentInsetAdjustmentBehavior="never"
      >
        <Text>Horizontal item</Text>
      </NativeTabScrollView>
    </NativeTabsInsetsProvider>,
  );
  expect(view.queryByTestId('scroll-marker')).toBeNull();
  expect(
    view.getByTestId('horizontal').props.contentInsetAdjustmentBehavior,
  ).toBe('never');
  expect(ScrollViewMarker).not.toHaveBeenCalled();
});

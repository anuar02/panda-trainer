import { fireEvent, render, screen } from '@testing-library/react-native';
import { Screen } from '../src/ui/screen';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TabBarLayoutProvider,
  useTabBarLayout,
} from '../src/features/navigation/tab-bar-layout';

const ReactNative =
  jest.requireActual<typeof import('react-native')>('react-native');

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  ),
  useSafeAreaInsets: jest.fn(),
}));

function Content() {
  const { bottomInset, panelBottom, onPanelLayout, setPanelVisible } =
    useTabBarLayout();
  return (
    <>
      <ScrollView
        testID="content"
        contentContainerStyle={{ paddingBottom: bottomInset }}
        keyboardShouldPersistTaps="handled"
      >
        <Text testID="last">Last item</Text>
      </ScrollView>
      <View
        testID="panel"
        onLayout={onPanelLayout}
        style={{ position: 'absolute', bottom: panelBottom }}
      />
      <Pressable testID="hide" onPress={() => setPanelVisible(false)} />
      <Pressable testID="show" onPress={() => setPanelVisible(true)} />
    </>
  );
}

beforeEach(() => {
  jest.mocked(useSafeAreaInsets).mockReturnValue({
    top: 0,
    left: 0,
    right: 0,
    bottom: 34,
  });
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 1,
  });
});

afterEach(() => jest.restoreAllMocks());

test('content scrolls beneath an absolute panel while its last item can clear the measured dock and safe area', async () => {
  await render(
    <TabBarLayoutProvider>
      <Content />
    </TabBarLayoutProvider>,
  );
  expect(screen.getByTestId('panel')).toHaveStyle({
    position: 'absolute',
    bottom: 34,
  });
  expect(screen.getByTestId('content').props.contentContainerStyle).toEqual({
    paddingBottom: 116,
  });
  await fireEvent(screen.getByTestId('panel'), 'layout', {
    nativeEvent: { layout: { height: 196, width: 366, x: 0, y: 0 } },
  });
  expect(screen.getByTestId('content').props.contentContainerStyle).toEqual({
    paddingBottom: 246,
  });
  expect(screen.getByTestId('last')).toHaveTextContent('Last item');
});

test('200% text reserves an increased initial height and uses a new measurement after font scale changes', async () => {
  const view = await render(
    <TabBarLayoutProvider>
      <Content />
    </TabBarLayoutProvider>,
  );
  await fireEvent(screen.getByTestId('panel'), 'layout', {
    nativeEvent: { layout: { height: 80, width: 366, x: 0, y: 0 } },
  });
  jest.mocked(ReactNative.useWindowDimensions).mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 2,
  });
  await view.rerender(
    <TabBarLayoutProvider>
      <Content />
    </TabBarLayoutProvider>,
  );
  expect(screen.getByTestId('content').props.contentContainerStyle).toEqual({
    paddingBottom: 201.6,
  });
  await fireEvent(screen.getByTestId('panel'), 'layout', {
    nativeEvent: { layout: { height: 220, width: 366, x: 0, y: 0 } },
  });
  expect(screen.getByTestId('content').props.contentContainerStyle).toEqual({
    paddingBottom: 270,
  });
});

test('devices without a home indicator retain the floating gap and hidden keyboard panel releases its inset', async () => {
  jest.mocked(useSafeAreaInsets).mockReturnValue({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  });
  await render(
    <TabBarLayoutProvider>
      <Content />
    </TabBarLayoutProvider>,
  );
  expect(screen.getByTestId('panel')).toHaveStyle({ bottom: 10 });
  await fireEvent.press(screen.getByTestId('hide'));
  expect(screen.getByTestId('content').props.contentContainerStyle).toEqual({
    paddingBottom: 0,
  });
  await fireEvent.press(screen.getByTestId('show'));
  expect(screen.getByTestId('content').props.contentContainerStyle).toEqual({
    paddingBottom: 92,
  });
});

test('screens outside tab navigation do not reserve a floating panel', async () => {
  await render(<Content />);
  expect(screen.getByTestId('content').props.contentContainerStyle).toEqual({
    paddingBottom: 0,
  });
});

test('shared Screen uses the measured floating inset and retains keyboard tap handling', async () => {
  await render(
    <TabBarLayoutProvider>
      <Screen title="Profile">
        <Text>Final action</Text>
      </Screen>
      <Content />
    </TabBarLayoutProvider>,
  );
  await fireEvent(screen.getByTestId('panel'), 'layout', {
    nativeEvent: { layout: { height: 178, width: 366, x: 0, y: 0 } },
  });
  let scroll = screen.getByText('Final action').parent;
  while (scroll && !('keyboardShouldPersistTaps' in scroll.props)) {
    scroll = scroll.parent;
  }
  expect(scroll?.props.contentContainerStyle).toEqual({ paddingBottom: 228 });
  expect(scroll?.props.keyboardShouldPersistTaps).toBe('handled');
  expect(screen.getByText('Final action')).toBeTruthy();
});

test('font changes retain measured dock clearance until another layout arrives', async () => {
  const view = await render(
    <TabBarLayoutProvider role="trainer">
      <Content />
    </TabBarLayoutProvider>,
  );
  await fireEvent(screen.getByTestId('panel'), 'layout', {
    nativeEvent: { layout: { height: 196, width: 366, x: 0, y: 0 } },
  });
  jest.mocked(ReactNative.useWindowDimensions).mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 1.1,
  });
  await view.rerender(
    <TabBarLayoutProvider role="trainer">
      <Content />
    </TabBarLayoutProvider>,
  );
  expect(screen.getByTestId('content').props.contentContainerStyle).toEqual({
    paddingBottom: 246,
  });
});

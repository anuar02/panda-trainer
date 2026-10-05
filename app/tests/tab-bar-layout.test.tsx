import { render } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { NavigationRouteContext } from 'expo-router/react-navigation';
import { Screen } from '../src/ui/screen';
import {
  NativeTabsInsetsProvider,
  useTabBarLayout,
} from '../src/features/navigation/tab-bar-layout';

function InsetProbe() {
  return <Text testID="inset">{JSON.stringify(useTabBarLayout())}</Text>;
}

test('compatibility hook reserves no additional native tab space without a provider', async () => {
  const view = await render(<InsetProbe />);
  expect(view.getByTestId('inset')).toHaveTextContent('{"bottomInset":0}');
});

test('shared screen retains keyboard tap handling without overriding automatic native content spacing', async () => {
  const view = await render(
    <Screen title="Profile">
      <Text>Final action</Text>
    </Screen>,
  );
  let scroll = view.getByText('Final action').parent;
  while (scroll && !('keyboardShouldPersistTaps' in scroll.props))
    scroll = scroll.parent;
  expect(scroll).not.toBeNull();
  expect(scroll?.props.keyboardShouldPersistTaps).toBe('handled');
  expect(scroll?.props.contentContainerStyle).toBeUndefined();
});

afterEach(() => jest.restoreAllMocks());

test.each([
  ['ios', 'today', 83],
  ['ios', 'schedule', 0],
  ['android', 'today', 0],
  ['web', 'today', 0],
] as const)(
  '%s %s reserves only measured iOS Today insets',
  async (os, name, expected) => {
    jest.replaceProperty(Platform, 'OS', os);
    const view = await render(
      <SafeAreaInsetsContext.Provider
        value={{ top: 0, left: 0, right: 0, bottom: 83 }}
      >
        <NativeTabsInsetsProvider>
          <NavigationRouteContext.Provider value={{ key: name, name }}>
            <InsetProbe />
          </NavigationRouteContext.Provider>
        </NativeTabsInsetsProvider>
      </SafeAreaInsetsContext.Provider>,
    );
    expect(view.getByTestId('inset')).toHaveTextContent(
      JSON.stringify({ bottomInset: expected }),
    );
  },
);

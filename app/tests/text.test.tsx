import { act, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet, Text as NativeText } from 'react-native';
import { useEffect } from 'react';
import { Text } from '../src/ui/text';

const mockMounted = jest.fn();
const mockUnmounted = jest.fn();

function LifecycleProbe() {
  useEffect(() => {
    mockMounted();
    return mockUnmounted;
  }, []);
  return <NativeText>Nested label</NativeText>;
}

const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');

function setFontScale(fontScale: number) {
  Dimensions.set({
    window: { ...originalWindow, fontScale },
    screen: { ...originalScreen, fontScale },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setFontScale(originalWindow.fontScale);
});

afterEach(() => {
  setFontScale(originalWindow.fontScale);
});

test('remounts native text when font scale changes and preserves forwarded props', async () => {
  const style = StyleSheet.create({ label: { fontSize: 18, lineHeight: 26 } });
  const view = await render(
    <Text
      testID="label"
      accessibilityLabel="Picker search"
      accessibilityRole="text"
      allowFontScaling={false}
      style={style.label}
    >
      <LifecycleProbe />
    </Text>,
  );
  expect(mockMounted).toHaveBeenCalledTimes(1);
  expect(mockUnmounted).not.toHaveBeenCalled();

  await view.rerender(
    <Text
      testID="label"
      accessibilityLabel="Picker search"
      accessibilityRole="text"
      allowFontScaling={false}
      style={style.label}
    >
      <LifecycleProbe />
    </Text>,
  );
  expect(mockMounted).toHaveBeenCalledTimes(1);
  expect(mockUnmounted).not.toHaveBeenCalled();

  await act(async () => setFontScale(originalWindow.fontScale + 1));
  expect(mockUnmounted).toHaveBeenCalledTimes(1);
  expect(mockMounted).toHaveBeenCalledTimes(2);

  const label = screen.getByTestId('label');
  expect(label.props.accessibilityLabel).toBe('Picker search');
  expect(label.props.accessibilityRole).toBe('text');
  expect(label.props.allowFontScaling).toBe(false);
  expect(label.props.style).toEqual({ fontSize: 18, lineHeight: 26 });
  expect(screen.getByText('Nested label')).toBeTruthy();
});

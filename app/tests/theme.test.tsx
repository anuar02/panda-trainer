import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, Text } from 'react-native';
import { useEffect } from 'react';
import { appearanceStorageKey, ThemeProvider, useTheme } from '../src/ui/theme';
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
});
function Probe({ onMount }: { onMount: () => void }) {
  useEffect(onMount, [onMount]);
  const { scheme, setAppearance } = useTheme();
  return (
    <>
      <Text testID="scheme">{scheme}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="auto"
        onPress={() => setAppearance('auto')}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="dark"
        onPress={() => setAppearance('dark')}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="light"
        onPress={() => setAppearance('light')}
      />
    </>
  );
}
test('switches both ways without remounting its child', async () => {
  const onMount = jest.fn();
  await render(
    <ThemeProvider>
      <Probe onMount={onMount} />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'dark' }));
  expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  await fireEvent.press(screen.getByRole('button', { name: 'light' }));
  expect(screen.getByTestId('scheme')).toHaveTextContent('light');
  expect(onMount).toHaveBeenCalledTimes(1);
});
test('auto follows the role and the workout follows a light override', async () => {
  const onMount = jest.fn();
  const view = await render(
    <ThemeProvider role="trainer">
      <Probe onMount={onMount} />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  await view.rerender(
    <ThemeProvider role="client">
      <Probe onMount={onMount} />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('scheme')).toHaveTextContent('light');
  await fireEvent.press(screen.getByRole('button', { name: 'light' }));
  await view.rerender(
    <ThemeProvider role="trainer" workout>
      <Probe onMount={onMount} />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('scheme')).toHaveTextContent('light');
  await view.rerender(
    <ThemeProvider role="trainer">
      <Probe onMount={onMount} />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('scheme')).toHaveTextContent('light');
  await fireEvent.press(screen.getByRole('button', { name: 'auto' }));
  expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
    appearanceStorageKey,
    'auto',
  );
});
test('restores a persisted override', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue('dark');
  await render(
    <ThemeProvider role="client">
      <Probe onMount={jest.fn()} />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
});
test('a late storage read cannot replace a newer user choice', async () => {
  let resolve: (value: string | null) => void = () => {};
  jest.mocked(AsyncStorage.getItem).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render(
    <ThemeProvider role="trainer">
      <Probe onMount={jest.fn()} />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'light' }));
  await act(async () => resolve('dark'));
  expect(screen.getByTestId('scheme')).toHaveTextContent('light');
});
test('storage failure leaves auto usable and manual choices still work', async () => {
  jest
    .mocked(AsyncStorage.getItem)
    .mockRejectedValueOnce(new Error('unavailable'));
  jest
    .mocked(AsyncStorage.setItem)
    .mockRejectedValueOnce(new Error('unavailable'));
  await render(
    <ThemeProvider role="trainer">
      <Probe onMount={jest.fn()} />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  await fireEvent.press(screen.getByRole('button', { name: 'light' }));
  expect(screen.getByTestId('scheme')).toHaveTextContent('light');
  await fireEvent.press(screen.getByRole('button', { name: 'dark' }));
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
    appearanceStorageKey,
    'dark',
  );
});

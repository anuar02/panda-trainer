import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { useEffect } from 'react';
import { ThemeProvider, useTheme } from '../src/ui/theme';
function Probe({ onMount }: { onMount: () => void }) {
  useEffect(onMount, [onMount]);
  const { scheme, setAppearance } = useTheme();
  return (
    <>
      <Text testID="scheme">{scheme}</Text>
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

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { ThemeProvider, useTheme } from '../src/ui/theme';
function Probe() {
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
test('switches both ways without remounting navigation', async () => {
  await render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'dark' }));
  expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  await fireEvent.press(screen.getByRole('button', { name: 'light' }));
  expect(screen.getByTestId('scheme')).toHaveTextContent('light');
});

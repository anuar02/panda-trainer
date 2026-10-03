import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import '../src/lib/i18n';
import { ThemeProvider } from '../src/ui/theme';
import { ProfilePreferences } from '../src/features/profiles/profile-screens';
import {
  calmModeStorageKey,
  useCalmMode,
  useCelebrationsEnabled,
} from '../src/ui/calm-mode';
function Probe() {
  const calm = useCalmMode();
  const celebrations = useCelebrationsEnabled();
  return <Text testID="consumer">{`${calm}:${celebrations}`}</Text>;
}
function Harness({ role = 'trainer' }: { role?: 'trainer' | 'client' }) {
  return (
    <ThemeProvider role={role}>
      <ProfilePreferences />
      <Probe />
    </ThemeProvider>
  );
}
beforeEach(() => {
  jest.mocked(AsyncStorage.getItem).mockReset().mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockReset().mockResolvedValue(undefined);
});
test('profile toggles the shared mascot/celebration flag, persists it and restores after remount', async () => {
  const view = await render(<Harness />);
  await waitFor(() =>
    expect(screen.getByTestId('consumer')).toHaveTextContent('false:true'),
  );
  await fireEvent.press(
    screen.getByRole('switch', { name: 'Спокойный интерфейс' }),
  );
  expect(
    screen.getByRole('switch', { name: 'Спокойный интерфейс' }),
  ).toBeChecked();
  expect(screen.getByTestId('consumer')).toHaveTextContent('true:false');
  await waitFor(() =>
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      calmModeStorageKey('trainer'),
      'true',
    ),
  );
  await view.unmount();
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (key) =>
      key === calmModeStorageKey('trainer') ? 'true' : null,
    );
  await render(<Harness />);
  await waitFor(() =>
    expect(
      screen.getByRole('switch', { name: 'Спокойный интерфейс' }),
    ).toBeChecked(),
  );
});
test('trainer and client keep independent preferences through role changes', async () => {
  const view = await render(<Harness />);
  await fireEvent.press(
    screen.getByRole('switch', { name: 'Спокойный интерфейс' }),
  );
  await view.rerender(<Harness role="client" />);
  expect(
    screen.getByRole('switch', { name: 'Спокойный интерфейс' }),
  ).not.toBeChecked();
  await view.rerender(<Harness />);
  expect(
    screen.getByRole('switch', { name: 'Спокойный интерфейс' }),
  ).toBeChecked();
});
test('late hydration does not overwrite a user choice and pending hydration suppresses celebrations', async () => {
  let resolve: (value: string | null) => void = () => {};
  jest.mocked(AsyncStorage.getItem).mockImplementation((key) =>
    key === calmModeStorageKey('trainer')
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve(null),
  );
  await render(<Harness />);
  expect(screen.getByTestId('consumer')).toHaveTextContent('false:false');
  await fireEvent.press(
    screen.getByRole('switch', { name: 'Спокойный интерфейс' }),
  );
  await act(async () => resolve('false'));
  expect(screen.getByTestId('consumer')).toHaveTextContent('true:false');
});
test('failed storage write is visible and a later toggle retries persistence', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk'));
  await render(<Harness />);
  await fireEvent.press(
    screen.getByRole('switch', { name: 'Спокойный интерфейс' }),
  );
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  await fireEvent.press(
    screen.getByRole('switch', { name: 'Спокойный интерфейс' }),
  );
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

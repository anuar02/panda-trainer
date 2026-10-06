import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import '@/lib/i18n';
import { TrainerProfileScreen } from '@/features/profiles/profile-screens';
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
test('demo export entry opens authenticated settings and retains library action', async () => {
  await render(<TrainerProfileScreen />);
  expect(
    screen.getByText(
      /Серверный экспорт доступен в настройках авторизованного аккаунта/,
    ),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Экспорт данных' }));
  expect(router.push).toHaveBeenCalledWith('/auth/account');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Библиотека и шаблоны' }),
  );
  expect(router.push).toHaveBeenCalledWith('/(trainer)/library');
});

import type { PropsWithChildren } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import {
  createSchedulingState,
  decodeSchedulingState,
  encodeSchedulingState,
} from '../src/domain/scheduling';
import { SchedulingDemoProvider } from '../src/features/scheduling-demo/provider';
import { TrainerInboxScreen } from '../src/features/trainer-inbox/trainer-inbox-screen';

jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ children, open }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
function storage() {
  let raw = encodeSchedulingState(createSchedulingState());
  return {
    getItem: jest.fn(async () => raw),
    setItem: jest.fn(async (_key: string, value: string) => {
      raw = value;
    }),
    state: () => decodeSchedulingState(raw)!,
  };
}

test('accept and decline update shared sessions, preserve other requests and survive remount', async () => {
  const saved = storage();
  const ui = () => (
    <SchedulingDemoProvider storage={saved}>
      <TrainerInboxScreen onBack={() => {}} />
    </SchedulingDemoProvider>
  );
  const view = await render(ui());
  await waitFor(() => expect(screen.getByTestId('request-r1')).toBeTruthy());
  await fireEvent.press(
    within(screen.getByTestId('request-r1')).getByRole('button', {
      name: 'Принять',
    }),
  );
  await waitFor(() =>
    expect(saved.state().requests.r1?.state).toBe('accepted'),
  );
  expect(saved.state().sessions.find((s) => s.id === 's8')?.date).toBe(
    '2026-09-18',
  );
  expect(screen.getByText('Перенос принят')).toBeTruthy();
  expect(screen.getByTestId('request-r2')).toBeTruthy();
  await fireEvent.press(
    within(screen.getByTestId('request-r2')).getByRole('button', {
      name: 'Отклонить',
    }),
  );
  await waitFor(() =>
    expect(saved.state().requests.r2?.state).toBe('declined'),
  );
  expect(saved.state().sessions.find((s) => s.id === 's9')?.date).toBe(
    '2026-09-15',
  );
  expect(screen.getByText('Всё согласовано')).toBeTruthy();
  await view.unmount();
  await render(ui());
  await waitFor(() => expect(screen.getByTestId('history-r1')).toBeTruthy());
  expect(screen.getByTestId('history-r2')).toBeTruthy();
  expect(screen.queryByTestId('request-r1')).toBeNull();
});

test('counterproposal awaits the client without moving the session and can be withdrawn', async () => {
  const saved = storage();
  await render(
    <SchedulingDemoProvider storage={saved}>
      <TrainerInboxScreen onBack={() => {}} />
    </SchedulingDemoProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('request-r1')).toBeTruthy());
  await fireEvent.press(
    within(screen.getByTestId('request-r1')).getByRole('button', {
      name: 'Другое время',
    }),
  );
  await fireEvent.changeText(
    screen.getByDisplayValue('2026-09-18'),
    '2026-09-19',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отправить предложение' }),
  );
  await waitFor(() => expect(saved.state().requests.r1?.state).toBe('counter'));
  expect(saved.state().sessions.find((s) => s.id === 's8')?.date).toBe(
    '2026-09-17',
  );
  const card = within(screen.getByTestId('request-r1'));
  expect(card.getByText('Ждёт клиента')).toBeTruthy();
  expect(card.queryByRole('button', { name: 'Принять' })).toBeNull();
  await fireEvent.press(card.getByRole('button', { name: 'Отозвать запрос' }));
  await waitFor(() =>
    expect(saved.state().requests.r1?.state).toBe('withdrawn'),
  );
  expect(screen.getByTestId('history-r1')).toBeTruthy();
});

test('failed hydration shows retry and never exposes fixture requests as writable', async () => {
  const saved = storage();
  saved.getItem.mockRejectedValueOnce(new Error('read'));
  await render(
    <SchedulingDemoProvider storage={saved}>
      <TrainerInboxScreen onBack={() => {}} />
    </SchedulingDemoProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Попробовать снова' }),
    ).toBeTruthy(),
  );
  expect(screen.queryByRole('button', { name: 'Принять' })).toBeNull();
  expect(screen.queryByText('Всё согласовано')).toBeNull();
  expect(saved.setItem).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  );
  await waitFor(() => expect(screen.getByTestId('request-r1')).toBeTruthy());
});

test('a failed save is visible and retry persists the resolved request', async () => {
  const saved = storage();
  saved.setItem.mockRejectedValueOnce(new Error('write'));
  await render(
    <SchedulingDemoProvider storage={saved}>
      <TrainerInboxScreen onBack={() => {}} />
    </SchedulingDemoProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('request-r1')).toBeTruthy());
  await fireEvent.press(
    within(screen.getByTestId('request-r1')).getByRole('button', {
      name: 'Принять',
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Попробовать снова' }),
    ).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  );
  await waitFor(() =>
    expect(saved.state().requests.r1?.state).toBe('accepted'),
  );
});

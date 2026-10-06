import type { PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import { decodeWorkoutState, type WorkoutAction } from '../src/domain/workout';
import {
  WorkoutDemoProvider,
  useWorkoutDemo,
  workoutStorageKey,
} from '../src/features/workout-demo';
import { ClientHistoryScreen } from '../src/features/client-history/client-history-screen';
import { ClientProgressScreen } from '../src/features/client-progress/client-progress-screen';

jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

const actions: Record<string, WorkoutAction[]> = {
  openClient: [{ type: 'open', sessionId: 's4' }],
  recordClient: [
    {
      type: 'save',
      clientId: 'c1',
      exerciseId: 'e1',
      setIndex: 0,
      value: { kg: 85, reps: 8 },
    },
    {
      type: 'addNote',
      clientId: 'c1',
      text: 'Приватная заметка Айгерим',
      at: '18:30',
    },
    {
      type: 'addNote',
      clientId: 'c1',
      text: 'Общая заметка Айгерим',
      at: '18:31',
    },
    { type: 'shareNote', clientId: 'c1', index: 1 },
  ],
  finish: [{ type: 'finish' }],
  confirm: [{ type: 'confirmPartial' }],
  recordOtherClient: [
    { type: 'open', sessionId: 's1' },
    {
      type: 'save',
      clientId: 'c5',
      exerciseId: 'e1',
      setIndex: 0,
      value: { kg: 150, reps: 12 },
    },
    {
      type: 'addNote',
      clientId: 'c5',
      text: 'Общая заметка Даны',
      at: '09:30',
    },
    { type: 'shareNote', clientId: 'c5', index: 0 },
    { type: 'finish' },
    { type: 'confirmPartial' },
  ],
};

function DispatchHarness() {
  const demo = useWorkoutDemo();
  return (
    <View>
      <Text testID="storage-status">{demo.storageStatus}</Text>
      <Text testID="finish-pending">
        {String(demo.state.sessions.s4?.finishPending ?? false)}
      </Text>
      {Object.entries(actions).map(([name, batch]) => (
        <Pressable
          key={name}
          accessibilityRole="button"
          accessibilityLabel={name}
          disabled={!demo.hydrated}
          onPress={() => batch.forEach((action) => demo.dispatch(action))}
        >
          <Text>{name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

test('provider journal completion updates client screens and survives storage restoration without leaking private or foreign data', async () => {
  let raw: string | null = null;
  const storage = {
    getItem: jest.fn(async () => raw),
    setItem: jest.fn(async (_key: string, value: string) => {
      raw = value;
    }),
  };
  const tree = (
    <WorkoutDemoProvider storage={storage}>
      <DispatchHarness />
      <ClientHistoryScreen />
      <ClientProgressScreen />
    </WorkoutDemoProvider>
  );
  const view = await render(tree);
  await waitFor(() =>
    expect(screen.getByTestId('storage-status')).toHaveTextContent('saved'),
  );
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(screen.getByText('Первые результаты — впереди')).toBeTruthy();
  expect(screen.getAllByLabelText('Списание: 1')).toHaveLength(2);

  await fireEvent.press(screen.getByRole('button', { name: 'openClient' }));
  await fireEvent.press(screen.getByRole('button', { name: 'recordClient' }));
  expect(screen.queryByText('85 кг × 8 повт')).toBeNull();
  expect(screen.queryByText(/Общая заметка Айгерим/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'finish' }));
  expect(screen.getByTestId('finish-pending')).toHaveTextContent('true');
  expect(screen.queryByText('85 кг × 8 повт')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'confirm' }));
  expect(screen.getByText('85 кг × 8 повт')).toBeTruthy();
  expect(screen.getByText(/Общая заметка Айгерим/)).toBeTruthy();
  expect(screen.queryByText(/Приватная заметка Айгерим/)).toBeNull();
  expect(screen.getByText('Журнал завершён')).toBeTruthy();

  await fireEvent.press(
    screen.getByRole('button', { name: 'recordOtherClient' }),
  );
  await waitFor(() =>
    expect(screen.getByTestId('storage-status')).toHaveTextContent('saved'),
  );
  expect(screen.queryByText(/Общая заметка Даны|150 кг/)).toBeNull();
  expect(screen.getAllByLabelText('Списание: 1')).toHaveLength(2);
  expect(screen.getAllByLabelText(/нет отметки посещения/)).toHaveLength(7);
  expect(screen.queryByText('Посещение')).toBeNull();
  expect(raw).not.toBeNull();
  const persisted = decodeWorkoutState(raw ?? '');
  expect(persisted?.sessions.s4?.finished).toBe(true);
  expect(persisted?.sessions.s1?.finished).toBe(true);
  expect(persisted?.sessions.s4?.notes?.c1?.[0]?.shared).toBe(false);
  expect(persisted?.sessions.s4?.notes?.c1?.[1]?.shared).toBe(true);
  expect(storage.setItem).toHaveBeenLastCalledWith(workoutStorageKey, raw);

  await view.unmount();
  storage.setItem.mockClear();
  await render(tree);
  await waitFor(() => expect(screen.getByText('85 кг × 8 повт')).toBeTruthy());
  expect(screen.getByText(/Общая заметка Айгерим/)).toBeTruthy();
  expect(
    screen.queryByText(/Приватная заметка Айгерим|Общая заметка Даны|150 кг/),
  ).toBeNull();
  expect(screen.getAllByLabelText('Списание: 1')).toHaveLength(2);
  expect(screen.getAllByLabelText(/нет отметки посещения/)).toHaveLength(7);
  expect(storage.getItem).toHaveBeenCalledTimes(2);
  expect(storage.getItem).toHaveBeenLastCalledWith(workoutStorageKey);
  expect(storage.setItem).not.toHaveBeenCalled();
});

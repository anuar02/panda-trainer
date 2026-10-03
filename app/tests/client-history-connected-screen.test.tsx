import type { PropsWithChildren } from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import { ClientConnectedHistoryScreen } from '../src/features/client-history/client-connected-history-screen';
import { useClientHistory } from '../src/features/client-history/use-history';
import type { ClientHistory } from '../src/features/client-history/service';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/client-history/use-history', () => ({
  useClientHistory: jest.fn(),
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
const history: ClientHistory = {
  context: {
    clientRecordId: 'card',
    workspaceId: 'workspace',
    clientName: 'Own client',
    trainerName: 'Own trainer',
    timezone: 'Pacific/Kiritimati',
  },
  nextOffset: 50,
  journals: [
    {
      id: 'own-finished',
      bookingId: 'booking',
      startedAtUtc: '2030-10-01T20:03:00Z',
      finishedAtUtc: '2030-10-01T21:00:00Z',
      revision: 2,
      exercises: [
        {
          id: 'historical',
          exerciseId: 'source',
          name: 'Immutable squat',
          measure: 'reps',
          bodyweight: false,
          muscleGroup: 'legs',
          equipment: 'barbell',
          instructions: [],
          position: 0,
          plannedSets: 3,
          plannedReps: '99',
          plannedSeconds: null,
          plannedWeightG: 99000,
          restSeconds: 60,
          replacedFromId: null,
          skipped: false,
          revision: 1,
          sets: [
            {
              id: 'actual-zero',
              position: 0,
              reps: 0,
              seconds: null,
              weightG: 0,
              revision: 1,
            },
            {
              id: 'actual-missing',
              position: 1,
              reps: null,
              seconds: null,
              weightG: null,
              revision: 1,
            },
          ],
        },
      ],
      notes: [
        {
          id: 'public',
          text: 'Own public historical note',
          revision: 1,
          createdAtUtc: '2030-10-01T21:00:00Z',
          updatedAtUtc: '2030-10-01T21:00:00Z',
        },
      ],
    },
  ],
};
const props = {
  userId: 'user',
  workspaceId: 'workspace',
  clientRecordId: 'card',
  trainerName: 'Fallback trainer',
};
const read = jest.mocked(useClientHistory),
  retry = jest.fn(),
  loadMore = jest.fn(),
  retryMore = jest.fn();
const state = () => ({
  generation: 0,
  history,
  loading: false,
  error: null,
  loadingMore: false,
  moreError: null,
  hasMore: true,
  retry,
  loadMore,
  retryMore,
});
beforeEach(() => {
  jest.clearAllMocks();
  read.mockReturnValue(state());
});
test('connected own finished journals use local actual start and preserve snapshot zero/null results', async () => {
  await render(<ClientConnectedHistoryScreen {...props} />);
  expect(screen.getByText('Own trainer')).toBeTruthy();
  expect(screen.getByText('10:03')).toBeTruthy();
  expect(screen.getByText(/Own public historical note/)).toBeTruthy();
  expect(screen.queryByText('Индивидуальное занятие')).toBeNull();
  expect(screen.queryByText('Списания и возвраты')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'ср, 2 окт · 10:03' }),
  );
  expect(screen.getByText('Immutable squat')).toBeTruthy();
  expect(screen.getByText('0 повт.')).toBeTruthy();
  expect(screen.getByText('0 кг')).toBeTruthy();
  expect(screen.getByText('Повторы не записаны')).toBeTruthy();
  expect(screen.getByText('Вес не записан')).toBeTruthy();
  expect(screen.queryByText('99 повт.')).toBeNull();
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 'user', clientRecordId: 'card' }),
  );
  expect(read.mock.calls[0]![0]).not.toHaveProperty('startsAtUtc');
});
test('loading and true empty never render demo history', async () => {
  read.mockReturnValue({
    ...state(),
    history: null,
    loading: true,
    hasMore: false,
  });
  const view = await render(<ClientConnectedHistoryScreen {...props} />);
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка раздела' }),
  ).toBeTruthy();
  expect(screen.queryByText('Низ А')).toBeNull();
  read.mockReturnValue({
    ...state(),
    history: { ...history, journals: [], nextOffset: null },
    hasMore: false,
  });
  await view.rerender(<ClientConnectedHistoryScreen {...props} />);
  expect(screen.getByText('Занятий пока нет')).toBeTruthy();
  expect(screen.queryByText('Данияр')).toBeNull();
});
test('workspace mismatch hides own-looking returned history and offers retry', async () => {
  read.mockReturnValue({
    ...state(),
    history: {
      ...history,
      context: { ...history.context, workspaceId: 'foreign' },
    },
  });
  await render(<ClientConnectedHistoryScreen {...props} />);
  expect(screen.queryByText('10:03')).toBeNull();
  expect(screen.queryByText(/Own public historical note/)).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});
test('account and client card remount removes prior journal detail', async () => {
  const view = await render(<ClientConnectedHistoryScreen {...props} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'ср, 2 окт · 10:03' }),
  );
  expect(screen.getByText('Immutable squat')).toBeTruthy();
  await view.rerender(
    <ClientConnectedHistoryScreen
      {...props}
      userId="other"
      clientRecordId="other-card"
    />,
  );
  expect(screen.queryByText('Immutable squat')).toBeNull();
  expect(read).toHaveBeenLastCalledWith(
    expect.objectContaining({ userId: 'other', clientRecordId: 'other-card' }),
  );
});
test('pagination failure preserves existing journals and retries only the failed page', async () => {
  read.mockReturnValue({ ...state(), moreError: 'request' });
  await render(<ClientConnectedHistoryScreen {...props} />);
  expect(screen.getByText('10:03')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  );
  expect(retryMore).toHaveBeenCalledTimes(1);
  expect(retry).not.toHaveBeenCalled();
});

test('replacement provenance marks the historical source while retaining replacement actual results', async () => {
  const original = history.journals[0]!.exercises[0]!;
  read.mockReturnValue({
    ...state(),
    history: {
      ...history,
      journals: [
        {
          ...history.journals[0]!,
          exercises: [
            { ...original, sets: [] },
            {
              ...original,
              id: 'replacement',
              name: 'Historical replacement',
              replacedFromId: original.id,
              sets: [
                {
                  id: 'replacement-result',
                  position: 0,
                  reps: 8,
                  seconds: null,
                  weightG: 12000,
                  revision: 1,
                },
              ],
            },
          ],
        },
      ],
    },
  });
  await render(<ClientConnectedHistoryScreen {...props} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'ср, 2 окт · 10:03' }),
  );
  expect(
    within(screen.getByText('Immutable squat').parent!).getByText('Заменено'),
  ).toBeTruthy();
  expect(
    within(screen.getByText('Historical replacement').parent!).queryByText(
      'Заменено',
    ),
  ).toBeNull();
  expect(screen.getByText('8 повт.')).toBeTruthy();
  expect(screen.getByText('12 кг')).toBeTruthy();
});

test('new history generation resets an open historical detail even for identical journals', async () => {
  const view = await render(<ClientConnectedHistoryScreen {...props} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'ср, 2 окт · 10:03' }),
  );
  expect(screen.getByText('Immutable squat')).toBeTruthy();
  read.mockReturnValue({ ...state(), generation: 1 });
  await view.rerender(<ClientConnectedHistoryScreen {...props} />);
  expect(screen.queryByText('Immutable squat')).toBeNull();
  expect(screen.getByText('10:03')).toBeTruthy();
});

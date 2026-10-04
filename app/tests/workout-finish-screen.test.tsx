import type { ReactNode } from 'react';
import { View as MockView, Text as MockText } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { WorkoutEntryPanel } from '@/features/workout-entry/screen';
import { useWorkoutEntry } from '@/features/workout-entry/use-entry';
import type { EntryRead } from '@/features/workout-entry/service';
import { finishParticipant } from './workout-finish-fixtures';
import { operation, session } from './workout-sync-fixtures';
import '@/lib/i18n';

jest.mock('@/features/program-update/panel', () => ({
  ProgramUpdatePanel: jest.fn(() => null),
}));
jest.mock('@/features/workout-entry/use-entry', () => ({
  useWorkoutEntry: jest.fn(),
}));
jest.mock('@/features/workout-sync', () => ({ WorkoutSyncStatus: () => null }));
jest.mock('../src/features/workout-corrections', () => ({
  CorrectionPanel: () => null,
}));
jest.mock('@/ui/sheet', () => ({
  Sheet: ({ children, title }: { children: ReactNode; title: string }) => (
    <MockView>
      <MockText>{title}</MockText>
      {children}
    </MockView>
  ),
}));

const finish = jest.fn(async () => {});
function fixture(
  count = 0,
  status: NonNullable<EntryRead['finish']>['status'] = 'available',
) {
  const participant = finishParticipant();
  if (status === 'not_finished') participant.workoutRevision = 10;
  const exercise = participant.exercises[0]!;
  exercise.sets = Array.from({ length: count }, (_, index) => ({
    id: `set-${index}`,
    revision: 1,
    position: index,
    weightGrams: 125,
    reps: 8,
    seconds: null,
  }));
  const state: EntryRead = {
    workout: {
      participant,
      tombstones: [],
      ...(status === 'not_finished'
        ? {
            finishOperation: {
              ...operation('finish-op', participant.workoutId),
              kind: 'finish_workout' as const,
              base_revision: 7,
              payload: {},
            },
            finishResolution: {
              operationId: 'resolution-op',
              conflictId: 'conflict',
              selection: 'current' as const,
            },
            finishRelease: {
              operationId: 'finish-op',
              resolutionOperationId: 'resolution-op',
              revision: 10,
            },
          }
        : {}),
    },
    draft: {
      workoutId: participant.workoutId,
      bookingId: participant.bookingId,
      focusExerciseId: exercise.id,
      values: {},
    },
    issues: [],
    finish: {
      status,
      operationId: status === 'available' ? null : 'finish-op',
      issue: null,
    },
  };
  jest.mocked(useWorkoutEntry).mockReturnValue({
    state,
    resources: { catalog: [], conflicts: [] },
    sync: null,
    busy: false,
    error: false,
    finish,
    retry: jest.fn(),
    retryDelivery: jest.fn(),
    execute: jest.fn(async () => {}),
  });
  return { participant, state };
}
const panel = (participant: ReturnType<typeof finishParticipant>) => (
  <WorkoutEntryPanel
    participant={participant}
    session={null}
    getSession={() => null}
  />
);
beforeEach(() => jest.clearAllMocks());

it.each([0, 1])(
  'requires explicit confirmation for %i recorded sets and retains composer edits when continuing',
  async (count) => {
    const test = fixture(count);
    await render(panel(test.participant));
    await fireEvent.changeText(screen.getByLabelText('Повторы'), '12');
    await fireEvent.press(screen.getByRole('button', { name: 'Завершить' }));
    expect(
      screen.getByText(`${count} из 3 записано · ${3 - count} без записи`),
    ).toBeTruthy();
    expect(finish).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Продолжить ввод' }),
    );
    expect(screen.getByLabelText('Повторы').props.value).toBe('12');
    expect(screen.queryByText('Завершить журнал?')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Завершить' }));
    await fireEvent.press(
      screen.getByRole('button', { name: 'Сохранить записанное и завершить' }),
    );
    expect(finish).toHaveBeenCalledTimes(1);
  },
);

it('finishes a fully recorded journal directly', async () => {
  const test = fixture(3);
  await render(panel(test.participant));
  await fireEvent.press(screen.getByRole('button', { name: 'Завершить' }));
  expect(finish).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Завершить журнал?')).toBeNull();
});

it('requires confirmation when a fully recorded journal still contains an unsaved composer draft', async () => {
  const test = fixture(3);
  test.state.draft.values[test.participant.exercises[0]!.id] = {
    weightGrams: 0,
    reps: 0,
    seconds: null,
  };
  await render(panel(test.participant));
  await fireEvent.press(screen.getByRole('button', { name: 'Завершить' }));
  expect(screen.getByText('Черновиков: 1')).toBeTruthy();
  expect(finish).not.toHaveBeenCalled();
});

it.each(['saved_on_phone', 'applied'] as const)(
  'shows %s completion separately and prevents another finish',
  async (status) => {
    const test = fixture(1, status);
    await render(panel(test.participant));
    expect(
      screen.getByText(
        status === 'applied'
          ? 'Журнал завершён · подтверждено сервером'
          : 'Завершение сохранено на телефоне · ожидает отправки',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Записанные результаты')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Завершить' })).toBeNull();
    expect(screen.queryByLabelText('Повторы')).toBeNull();
  },
);

it.each(['conflict', 'correction_draft'] as const)(
  'does not claim completion for a %s receipt',
  async (status) => {
    const test = fixture(1, status);
    await render(panel(test.participant));
    expect(
      screen.queryByText('Журнал завершён · подтверждено сервером'),
    ).toBeNull();
    expect(
      screen.queryByText('Завершение сохранено на телефоне · ожидает отправки'),
    ).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Завершить' }));
    expect(finish).not.toHaveBeenCalled();
  },
);

it('dismisses an old participant finish sheet when selection changes without remount', async () => {
  const first = fixture();
  const view = await render(panel(first.participant));
  await fireEvent.press(screen.getByRole('button', { name: 'Завершить' }));
  const next = finishParticipant(1);
  jest.mocked(useWorkoutEntry).mockReturnValue({
    ...jest.mocked(useWorkoutEntry).mock.results[0]!.value,
    state: {
      ...first.state,
      workout: { participant: next, tombstones: [] },
      draft: {
        workoutId: next.workoutId,
        bookingId: next.bookingId,
        focusExerciseId: next.exercises[0]!.id,
        values: {},
      },
    },
  });
  await view.rerender(panel(next));
  expect(screen.queryByText('Завершить журнал?')).toBeNull();
  expect(finish).not.toHaveBeenCalled();
});

it('shows proved current-version resolution and permits editing and a new explicit finish', async () => {
  const test = fixture(1, 'not_finished');
  await render(panel(test.participant));
  expect(
    screen.getByText('Сохранена текущая версия · журнал не завершён'),
  ).toBeTruthy();
  expect(screen.getByText('Записанные результаты')).toBeTruthy();
  expect(
    screen.queryByText('Журнал завершён · подтверждено сервером'),
  ).toBeNull();
  expect(
    screen.queryByText('Завершение сохранено на телефоне · ожидает отправки'),
  ).toBeNull();
  expect(screen.getByLabelText('Повторы').props.editable).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Завершить' }));
  expect(screen.getByText('Завершить журнал?')).toBeTruthy();
  expect(finish).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить записанное и завершить' }),
  );
  expect(finish).toHaveBeenCalledTimes(1);
});

it('keeps an unresolved current-version envelope locked despite an unfinished label', async () => {
  const test = fixture(1, 'not_finished');
  delete test.state.workout.finishRelease;
  await render(panel(test.participant));
  expect(screen.queryByLabelText('Повторы')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Завершить' })).toBeNull();
});

it('keeps a finish sheet for equivalent session objects and resets it on bearer refresh without exposing credentials', async () => {
  const test = fixture();
  let current = { ...session };
  const panel = () => (
    <WorkoutEntryPanel
      participant={test.participant}
      session={current}
      getSession={() => current}
    />
  );
  const view = await render(panel());
  await fireEvent.press(screen.getByRole('button', { name: 'Завершить' }));
  current = { ...session };
  await view.rerender(panel());
  expect(screen.getByText('Завершить журнал?')).toBeTruthy();
  current.accessToken = 'refreshed-private-token';
  await view.rerender(panel());
  expect(screen.queryByText('Завершить журнал?')).toBeNull();
  expect(JSON.stringify(view.toJSON())).not.toContain(current.accessToken);
});

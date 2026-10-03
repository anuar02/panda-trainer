import { fireEvent, render, screen } from '@testing-library/react-native';
import type {
  PreloadExercise,
  PreloadParticipant,
} from '../src/domain/workout-preload/types';
import type { SetValues } from '../src/domain/workout-entry';
import type {
  EntryRead,
  WorkoutEntryService,
} from '../src/features/workout-entry/service';
import { WorkoutEntryPanel } from '../src/features/workout-entry/screen';
import { useWorkoutEntry } from '../src/features/workout-entry/use-entry';
import '../src/lib/i18n';

jest.mock('../src/features/workout-entry/use-entry', () => ({
  useWorkoutEntry: jest.fn(),
}));
jest.mock('../src/features/workout-sync', () => ({
  WorkoutSyncStatus: () => null,
}));
jest.mock('../src/ui/sheet', () => ({ Sheet: () => null }));

const blank: SetValues = { weightGrams: null, reps: null, seconds: null };
function exercise(id: string): PreloadExercise {
  return {
    id,
    exerciseId: id,
    name: `Exercise ${id}`,
    measure: 'reps',
    bodyweight: false,
    muscleGroup: 'legs',
    equipment: 'barbell',
    instructions: [],
    sourceKey: null,
    skipped: false,
    replacedFromId: null,
    position: 0,
    plannedSets: 3,
    plannedReps: '8–12',
    plannedSeconds: null,
    plannedWeightGrams: null,
    restSeconds: 60,
    revision: 1,
    sets: [],
    previousSets: [],
  };
}
function participant(id = 'one'): PreloadParticipant {
  return {
    bookingId: `booking-${id}`,
    clientRecordId: `client-${id}`,
    clientName: id,
    programId: `program-${id}`,
    programName: 'Program',
    programDescription: '',
    baseTemplateId: `template-${id}`,
    programRevision: 1,
    workoutId: `workout-${id}`,
    workoutRevision: 1,
    workoutStatus: 'in_progress',
    assignedExercises: [],
    exercises: [exercise('first'), exercise('second')],
  };
}
function fixture(p = participant(), values: SetValues = blank) {
  const state: EntryRead = {
    workout: { participant: p, tombstones: [] },
    draft: {
      workoutId: p.workoutId,
      bookingId: p.bookingId,
      focusExerciseId: 'first',
      values: { first: values },
    },
    issues: [],
  };
  const service = {
    saveDraft: jest.fn(async () => {}),
    confirm: jest.fn(async () => state),
    undo: jest.fn(async () => state),
    read: jest.fn(async () => state),
  };
  jest.mocked(useWorkoutEntry).mockReturnValue({
    state,
    resources: { catalog: [], conflicts: [] },
    sync: null,
    error: false,
    busy: false,
    retry: jest.fn(),
    retryDelivery: jest.fn(),
    execute: jest.fn(async (action) => {
      await action(service as unknown as WorkoutEntryService);
    }),
  });
  return { p, state, service };
}
const panel = (p: PreloadParticipant) => (
  <WorkoutEntryPanel
    key={p.workoutId}
    session={null}
    getSession={() => null}
    participant={p}
  />
);
beforeEach(() => jest.clearAllMocks());

it('shows one focused composer and preserves zero versus null in restored draft', async () => {
  const test = fixture(undefined, {
    weightGrams: 0,
    reps: null,
    seconds: null,
  });
  await render(panel(test.p));
  expect(screen.getAllByLabelText('Вес, кг')).toHaveLength(1);
  expect(screen.getByLabelText('Вес, кг').props.value).toBe('0');
  expect(screen.getByLabelText('Повторы').props.value).toBe('');
  expect(screen.getByText('Сейчас · 1 из 2')).toBeTruthy();
  expect(test.service.confirm).not.toHaveBeenCalled();
});

it('copies previous values only into a draft until explicit confirmation', async () => {
  const p = participant();
  p.exercises[0]!.previousSets = [
    {
      id: 'previous',
      revision: 1,
      position: 0,
      weightGrams: 0,
      reps: 0,
      seconds: null,
    },
  ];
  const test = fixture(p);
  await render(panel(p));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Как в прошлый раз' }),
  );
  expect(test.service.saveDraft).toHaveBeenCalledWith(
    p,
    expect.objectContaining({
      values: { first: { weightGrams: 0, reps: 0, seconds: null } },
    }),
  );
  expect(screen.getByLabelText('Вес, кг').props.value).toBe('0');
  expect(screen.getByLabelText('Повторы').props.value).toBe('0');
  expect(test.service.confirm).not.toHaveBeenCalled();
});

it('confirms exact integer grams and repetitions after decimal comma input', async () => {
  const test = fixture();
  await render(panel(test.p));
  await fireEvent.changeText(screen.getByLabelText('Вес, кг'), '52,125');
  await fireEvent.changeText(screen.getByLabelText('Повторы'), '8');
  expect(test.service.confirm).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Записать подход 1' }),
  );
  expect(test.service.confirm).toHaveBeenCalledWith(test.p, 'first', {
    weightGrams: 52125,
    reps: 8,
    seconds: null,
  });
});

it('remounting another participant clears the first editor values', async () => {
  const first = fixture();
  const view = await render(panel(first.p));
  await fireEvent.changeText(screen.getByLabelText('Вес, кг'), '99');
  const second = fixture(participant('two'));
  await view.rerender(panel(second.p));
  expect(screen.getByLabelText('Вес, кг').props.value).toBe('');
  await fireEvent.changeText(screen.getByLabelText('Повторы'), '7');
  expect(second.service.saveDraft).toHaveBeenCalledWith(
    second.p,
    expect.objectContaining({ workoutId: 'workout-two' }),
  );
  expect(first.service.confirm).not.toHaveBeenCalled();
});

it('undo dispatches the recorded set to the durable service', async () => {
  const p = participant();
  p.exercises[0]!.sets = [
    {
      id: 'recorded-set',
      revision: 1,
      position: 0,
      weightGrams: 20000,
      reps: 8,
      seconds: null,
    },
  ];
  const test = fixture(p);
  await render(panel(p));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить последнюю запись' }),
  );
  expect(test.service.undo).toHaveBeenCalledWith(p, 'recorded-set');
});

it('finished journals disable confirmation and result fields', async () => {
  const p = participant();
  p.workoutStatus = 'finished';
  const test = fixture(p);
  await render(panel(p));
  expect(screen.getByLabelText('Вес, кг').props.editable).toBe(false);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Записать подход 1' }),
  );
  expect(test.service.confirm).not.toHaveBeenCalled();
});

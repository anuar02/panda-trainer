import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { CorrectionPanel } from '@/features/workout-corrections/panel';
import { useWorkoutCorrections } from '@/features/workout-corrections/use-corrections';
import type { CorrectionReview } from '@/features/workout-corrections/types';
import type { PreloadParticipant } from '@/domain/workout-preload/types';
import '@/lib/i18n';

jest.mock('@/features/workout-corrections/use-corrections', () => ({
  useWorkoutCorrections: jest.fn(),
}));
jest.mock('@/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
const id = (n: number) =>
  `51000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session = {
  accountId: id(1),
  workspaceId: id(2),
  sessionId: id(3),
  accessToken: 'synthetic',
};
const participant: PreloadParticipant = {
  bookingId: id(10),
  clientRecordId: id(11),
  clientName: 'Synthetic',
  programId: id(12),
  programName: 'Synthetic',
  programDescription: '',
  baseTemplateId: id(13),
  programRevision: 1,
  workoutId: id(4),
  workoutRevision: 2,
  workoutStatus: 'finished',
  exercises: [],
  assignedExercises: [],
};
const review: CorrectionReview = {
  account_id: id(1),
  workspace_id: id(2),
  workout_id: id(4),
  draft_id: id(5),
  operation: {
    operation_id: id(7),
    kind: 'upsert_set',
    entity_id: id(8),
    device_id: id(9),
    base_revision: 1,
    created_at: '2026-10-04T10:00:00Z',
    payload: {
      workout_instance_id: id(4),
      workout_exercise_id: id(20),
      position: 0,
      reps: 0,
      seconds: null,
      weight_g: 0,
    },
  },
  finished_at: '2026-10-04T10:00:00Z',
  applied_at: null,
  applied_request_id: null,
  receipt: null,
  workout_revision: 2,
  entity_revision: 1,
  exercise_revision: 2,
  current_version: {
    entity: {
      id: id(8),
      device_id: id(21),
      reps: 8,
      seconds: null,
      weight_g: 40000,
    },
    exercise: null,
    sets: [],
    replacements: [],
  },
  conflict: null,
};
const confirm = jest.fn(async () => {});
const openReview = jest.fn(async (_id: string) => {});
const cancel = jest.fn();
const reload = jest.fn();
function fixture(
  overrides: Partial<ReturnType<typeof useWorkoutCorrections>> = {},
) {
  jest.mocked(useWorkoutCorrections).mockReturnValue({
    reviews: [review],
    selected: null,
    pending: null,
    busy: false,
    error: null,
    applied: false,
    confirm,
    review: openReview,
    cancel,
    reload,
    ...overrides,
  });
  return render(
    <CorrectionPanel
      session={session}
      getSession={() => session}
      participant={participant}
    />,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
});
test('finished journal opens review without automatically applying correction', async () => {
  await fixture();
  expect(confirm).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Посмотреть исправление'));
  expect(openReview).toHaveBeenCalledWith(id(5));
  expect(confirm).not.toHaveBeenCalled();
});
test('review shows both devices and preserves null versus zero before explicit confirmation', async () => {
  await fixture({ selected: review });
  expect(screen.getByText(`Устройство: ${id(21)}`)).toBeTruthy();
  expect(screen.getByText(`Устройство: ${id(9)}`)).toBeTruthy();
  expect(screen.getByText('Повторы: 0')).toBeTruthy();
  expect(screen.getAllByText('Время: — с')).toHaveLength(2);
  await fireEvent.press(screen.getByText('Подтвердить исправление'));
  expect(confirm).toHaveBeenCalledTimes(1);
});
test('reopened unresolved request offers retry without creating a new selection', async () => {
  await fixture({
    reviews: [],
    pending: {
      draftId: id(5),
      requestId: id(6),
      expectedWorkoutRevision: 2,
      expectedEntityRevision: 1,
      expectedExerciseRevision: 2,
    },
  });
  await fireEvent.press(screen.getByText('Повторить тот же запрос'));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(openReview).not.toHaveBeenCalled();
});
test('busy review disables confirmation and cancel', async () => {
  await fixture({ selected: review, busy: true });
  await fireEvent.press(screen.getByText('Подтвердить исправление'));
  await fireEvent.press(screen.getByText('Отмена'));
  expect(confirm).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});

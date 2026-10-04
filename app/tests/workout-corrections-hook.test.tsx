import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useWorkoutCorrections } from '@/features/workout-corrections/use-corrections';
import type {
  CorrectionCommand,
  CorrectionReview,
  CorrectionReceipt,
} from '@/features/workout-corrections/types';
import type { SyncSession } from '@/domain/workout-sync/types';
import type { PreloadParticipant } from '@/domain/workout-preload/types';

const id = (n: number) =>
  `51000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mockSession: SyncSession = {
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
const scope = { account_id: id(1), workspace_id: id(2), workout_id: id(4) };
const finished = '2026-10-04T10:00:00Z';
const command: CorrectionCommand = {
  draftId: id(5),
  requestId: id(6),
  expectedWorkoutRevision: 2,
  expectedEntityRevision: 0,
  expectedExerciseRevision: null,
};
const receipt: CorrectionReceipt = {
  ...scope,
  draft_id: id(5),
  request_id: id(6),
  status: 'applied',
  revision: 3,
  entity_revision: 1,
  finished_at: finished,
};
const review: CorrectionReview = {
  ...scope,
  draft_id: id(5),
  operation: {
    operation_id: id(7),
    kind: 'set_note',
    entity_id: id(8),
    device_id: id(9),
    base_revision: 0,
    created_at: finished,
    payload: {
      workout_instance_id: id(4),
      text: 'Synthetic correction',
      shared: true,
    },
  },
  finished_at: finished,
  applied_at: null,
  applied_request_id: null,
  receipt: null,
  workout_revision: 2,
  entity_revision: 0,
  exercise_revision: null,
  current_version: { entity: null, exercise: null, sets: [], replacements: [] },
  conflict: null,
};
const readback: CorrectionReview = {
  ...review,
  workout_revision: 3,
  applied_at: finished,
  applied_request_id: id(6),
  receipt,
};
let mockSaved: CorrectionCommand | null = null;
let mockValid = true;
const mockList = jest.fn(async () => [review]);
const mockReview = jest.fn(async () => review);
const mockApply = jest.fn(async (_command: CorrectionCommand) => receipt);
const mockSave = jest.fn(
  async (
    _actor: string,
    _workspace: string,
    _workout: string,
    value: CorrectionCommand,
  ) => {
    mockSaved = value;
  },
);
const mockClear = jest.fn(async (..._args: unknown[]) => {
  mockSaved = null;
  return true;
});
const mockRefreshRead = jest.fn(async () => ({
  participants: [{ ...participant, workoutRevision: 3 }],
}));
const mockDispose = jest.fn();
jest.mock('expo-crypto', () => ({
  randomUUID: () => '51000000-0000-4000-8000-000000000006',
}));
jest.mock('@/features/workout-corrections/service', () => ({
  createCorrectionTransport: () => ({
    scope: {
      accountId: '51000000-0000-4000-8000-000000000001',
      workspaceId: '51000000-0000-4000-8000-000000000002',
      workoutId: '51000000-0000-4000-8000-000000000004',
    },
    valid: () => mockValid,
    dispose: mockDispose,
    verifiedSession: async () => mockSession,
    list: mockList,
    review: mockReview,
    apply: mockApply,
  }),
}));
jest.mock('@/features/workout-corrections/pending', () => ({
  loadPendingCorrectionCommand: async () => mockSaved,
  savePendingCorrectionCommand: (...args: Parameters<typeof mockSave>) =>
    mockSave(...args),
  clearPendingCorrectionCommand: (...args: unknown[]) => mockClear(...args),
}));
jest.mock('@/features/workout-preload/service', () => ({
  createWorkoutPreloadReader: () => ({ load: mockRefreshRead }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSaved = null;
  mockValid = true;
  mockList.mockResolvedValue([review]);
  mockReview.mockResolvedValue(review);
  mockApply.mockResolvedValue(receipt);
  mockSave.mockImplementation(async (_actor, _workspace, _workout, value) => {
    mockSaved = value;
  });
  mockClear.mockImplementation(async () => {
    mockSaved = null;
    return true;
  });
  mockRefreshRead.mockResolvedValue({
    participants: [{ ...participant, workoutRevision: 3 }],
  });
});
async function mount(
  onRefresh = jest.fn(async (_next: PreloadParticipant) => {}),
) {
  const hook = await renderHook(
    (value: PreloadParticipant) =>
      useWorkoutCorrections(mockSession, () => mockSession, value, onRefresh),
    { initialProps: participant },
  );
  await waitFor(() => expect(hook.result.current.reviews).toHaveLength(1));
  return { ...hook, onRefresh };
}
async function select(hook: Awaited<ReturnType<typeof mount>>) {
  await act(async () => {
    await hook.result.current.review(id(5));
  });
  expect(hook.result.current.selected).toEqual(review);
}
test('opening and reviewing never apply; confirmation rereads server journal before clearing', async () => {
  const hook = await mount();
  await select(hook);
  expect(mockApply).not.toHaveBeenCalled();
  expect(mockSaved).toBeNull();
  mockReview.mockResolvedValue(readback);
  await act(async () => {
    await hook.result.current.confirm();
  });
  expect(mockApply).toHaveBeenCalledWith(command);
  expect(mockRefreshRead).toHaveBeenCalledWith(
    mockSession,
    participant.bookingId,
    expect.any(AbortSignal),
  );
  expect(hook.onRefresh).toHaveBeenCalledWith({
    ...participant,
    workoutRevision: 3,
  });
  expect(mockClear).toHaveBeenCalledTimes(1);
  expect(hook.result.current.applied).toBe(true);
});
test('same-tick double confirmation issues one durable request', async () => {
  const hook = await mount();
  await select(hook);
  mockReview.mockResolvedValue(readback);
  await act(async () => {
    await Promise.all([
      hook.result.current.confirm(),
      hook.result.current.confirm(),
    ]);
  });
  expect(mockApply).toHaveBeenCalledTimes(1);
});
test('lost result keeps request; reopen restores review and retry uses same request', async () => {
  const hook = await mount();
  await select(hook);
  mockApply.mockRejectedValueOnce(new Error('correction_request'));
  await act(async () => {
    await hook.result.current.confirm();
  });
  expect(mockSaved).toEqual(command);
  expect(hook.result.current.applied).toBe(false);
  await hook.unmount();
  const reopened = await mount();
  expect(reopened.result.current.pending).toEqual(command);
  expect(reopened.result.current.selected).toEqual(review);
  expect(mockApply).toHaveBeenCalledTimes(1);
  mockReview.mockResolvedValue(readback);
  await act(async () => {
    await reopened.result.current.confirm();
  });
  expect(mockApply.mock.calls.map(([value]) => value)).toEqual([
    command,
    command,
  ]);
  expect(reopened.result.current.applied).toBe(true);
});
test('failed conditional cleanup cannot announce success', async () => {
  const hook = await mount();
  await select(hook);
  mockReview.mockResolvedValue(readback);
  mockClear.mockResolvedValueOnce(false);
  await act(async () => {
    await hook.result.current.confirm();
  });
  expect(hook.result.current.applied).toBe(false);
  expect(hook.result.current.pending).toEqual(command);
  expect(hook.result.current.error).toBe('correction_storage');
});
test('fresh result with stale preload is retained for safe retry', async () => {
  const hook = await mount();
  await select(hook);
  mockReview.mockResolvedValue(readback);
  mockRefreshRead.mockResolvedValueOnce({ participants: [participant] });
  await act(async () => {
    await hook.result.current.confirm();
  });
  expect(mockClear).not.toHaveBeenCalled();
  expect(hook.result.current.applied).toBe(false);
  expect(hook.result.current.error).toBe('correction_readback');
});
test('participant switch suppresses an old apply result and refresh', async () => {
  const hook = await mount();
  await select(hook);
  let resolve = (_value: CorrectionReceipt) => {};
  mockApply.mockImplementationOnce(
    () =>
      new Promise<CorrectionReceipt>((done) => {
        resolve = done;
      }),
  );
  let applying: Promise<void> | undefined;
  await act(async () => {
    applying = hook.result.current.confirm();
    await Promise.resolve();
  });
  await hook.rerender({
    ...participant,
    workoutStatus: 'in_progress',
    workoutId: id(99),
  });
  await act(async () => {
    resolve(receipt);
    await applying;
  });
  expect(hook.result.current.selected).toBeNull();
  expect(hook.result.current.applied).toBe(false);
  expect(hook.onRefresh).not.toHaveBeenCalled();
  expect(mockClear).not.toHaveBeenCalled();
});
test('storage save failure never sends correction and preserves explicit review', async () => {
  const hook = await mount();
  await select(hook);
  mockSave.mockRejectedValueOnce(new Error('storage'));
  await act(async () => {
    await hook.result.current.confirm();
  });
  expect(mockApply).not.toHaveBeenCalled();
  expect(mockClear).not.toHaveBeenCalled();
  expect(hook.result.current.selected).toEqual(review);
  expect(hook.result.current.applied).toBe(false);
});
test('late rejected request after participant switch cannot leak error into next journal', async () => {
  const hook = await mount();
  await select(hook);
  let reject = (_error: Error) => {};
  mockApply.mockImplementationOnce(
    () =>
      new Promise<CorrectionReceipt>((_resolve, done) => {
        reject = done;
      }),
  );
  let applying: Promise<void> | undefined;
  await act(async () => {
    applying = hook.result.current.confirm();
    await Promise.resolve();
  });
  await hook.rerender({
    ...participant,
    workoutStatus: 'in_progress',
    workoutId: id(99),
  });
  await act(async () => {
    reject(new Error('correction_unavailable'));
    await applying;
  });
  expect(hook.result.current.error).toBeNull();
  expect(hook.result.current.pending).toBeNull();
});
test('same participant relogin invalidates previously reviewed confirmation', async () => {
  const hook = await mount();
  await select(hook);
  mockValid = false;
  await hook.rerender({ ...participant });
  expect(hook.result.current.selected).toBeNull();
  await act(async () => {
    await hook.result.current.confirm();
  });
  expect(mockApply).not.toHaveBeenCalled();
  expect(mockSaved).toBeNull();
});
test('unmount during preload reread leaves saved command and skips parent refresh', async () => {
  const hook = await mount();
  await select(hook);
  mockReview.mockResolvedValue(readback);
  let resolve = (_value: { participants: PreloadParticipant[] }) => {};
  mockRefreshRead.mockImplementationOnce(
    () =>
      new Promise<{ participants: PreloadParticipant[] }>((done) => {
        resolve = done;
      }),
  );
  let applying: Promise<void> | undefined;
  await act(async () => {
    applying = hook.result.current.confirm();
    await Promise.resolve();
    await Promise.resolve();
  });
  await waitFor(() => expect(mockRefreshRead).toHaveBeenCalledTimes(1));
  await hook.unmount();
  await act(async () => {
    resolve({ participants: [{ ...participant, workoutRevision: 3 }] });
    await applying;
  });
  expect(hook.onRefresh).not.toHaveBeenCalled();
  expect(mockClear).not.toHaveBeenCalled();
  expect(mockSaved).toEqual(command);
});

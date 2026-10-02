import {
  submitWorkspaceBookingStatus,
  resumeWorkspaceBookingStatus,
} from '@/features/workspace-scheduling/status-submission';
import { createWorkspaceBookingStatusOperation } from '@/features/workspace-scheduling/status-operation';
import {
  loadPendingWorkspaceBookingStatus,
  savePendingWorkspaceBookingStatus,
  clearPendingWorkspaceBookingStatus,
  type PendingWorkspaceBookingStatus,
} from '@/features/workspace-scheduling/status-pending';
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));

jest.mock('@/features/workspace-scheduling/status-operation', () => ({
  createWorkspaceBookingStatusOperation: jest.fn(),
}));
jest.mock('@/features/workspace-scheduling/status-pending', () => ({
  loadPendingWorkspaceBookingStatus: jest.fn(),
  savePendingWorkspaceBookingStatus: jest.fn(),
  clearPendingWorkspaceBookingStatus: jest.fn(),
}));
const userId = '51000000-0000-4000-8000-000000000001';
const workspaceId = '61000000-0000-4000-8000-000000000001';
const command: PendingWorkspaceBookingStatus = {
  bookingId: '71000000-0000-4000-8000-000000000001',
  action: 'confirm',
  expectedRevision: 2,
  requestId: 'a1000000-0000-4000-8000-000000000001',
};
const result = {
  bookingId: command.bookingId,
  revision: 3,
  status: 'confirmed' as const,
  replayed: false,
};
const execute = jest.fn();
const save = jest.mocked(savePendingWorkspaceBookingStatus);
const load = jest.mocked(loadPendingWorkspaceBookingStatus);
const clear = jest.mocked(clearPendingWorkspaceBookingStatus);

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(createWorkspaceBookingStatusOperation)
    .mockReturnValue({ execute });
  execute.mockResolvedValue(result);
  save.mockResolvedValue();
  clear.mockResolvedValue(true);
  load.mockResolvedValue(command);
});

test('waits for durable storage before contacting the server', async () => {
  let saved = () => {};
  save.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      saved = resolve;
    }),
  );
  const pending = submitWorkspaceBookingStatus(userId, workspaceId, command);
  await Promise.resolve();
  expect(execute).not.toHaveBeenCalled();
  saved();
  expect(await pending).toEqual(result);
  expect(clear).toHaveBeenCalledWith(userId, workspaceId, command.requestId);
});
test('does not send when storage fails or another command is unresolved', async () => {
  save.mockRejectedValueOnce(new Error('unresolved'));
  await expect(
    submitWorkspaceBookingStatus(userId, workspaceId, command),
  ).rejects.toThrow('unresolved');
  expect(execute).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
});
test('keeps the pending command after a lost response', async () => {
  execute.mockRejectedValueOnce(new Error('response lost'));
  await expect(
    submitWorkspaceBookingStatus(userId, workspaceId, command),
  ).rejects.toThrow('response lost');
  expect(clear).not.toHaveBeenCalled();
  execute.mockResolvedValueOnce({ ...result, replayed: true });
  expect(await resumeWorkspaceBookingStatus(userId, workspaceId)).toMatchObject(
    {
      replayed: true,
    },
  );
  expect(createWorkspaceBookingStatusOperation).toHaveBeenNthCalledWith(2, {
    ...command,
    expectedUserId: userId,
  });
});
test('recovers a receipt when local cleanup fails after server creation', async () => {
  clear.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(
    submitWorkspaceBookingStatus(userId, workspaceId, command),
  ).rejects.toThrow('storage unavailable');
  execute.mockResolvedValueOnce({ ...result, replayed: true });
  expect(await resumeWorkspaceBookingStatus(userId, workspaceId)).toMatchObject(
    {
      replayed: true,
    },
  );
});
test.each(['conflict', 'invalidState', 'unavailable'])(
  'retains exact command after %s',
  async (code) => {
    execute.mockRejectedValueOnce(new Error(code));
    await expect(
      submitWorkspaceBookingStatus(userId, workspaceId, command),
    ).rejects.toThrow(code);
    expect(clear).not.toHaveBeenCalled();
  },
);
test('does nothing when the current scope has no pending command', async () => {
  load.mockResolvedValueOnce(null);
  expect(await resumeWorkspaceBookingStatus(userId, workspaceId)).toBeNull();
  expect(save).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
test('corrupt saved data blocks recovery', async () => {
  load.mockRejectedValueOnce(new Error('invalid'));
  await expect(
    resumeWorkspaceBookingStatus(userId, workspaceId),
  ).rejects.toThrow('invalid');
  expect(execute).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
});

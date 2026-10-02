import {
  submitWorkspaceBooking,
  resumeWorkspaceBooking,
} from '@/features/workspace-scheduling/creation';
import { createWorkspaceBookingOperation } from '@/features/workspace-scheduling/create-operation';
import {
  loadPendingWorkspaceBooking,
  savePendingWorkspaceBooking,
  clearPendingWorkspaceBooking,
  type PendingWorkspaceBooking,
} from '@/features/workspace-scheduling/pending';

jest.mock('@/features/workspace-scheduling/create-operation', () => ({
  createWorkspaceBookingOperation: jest.fn(),
}));
jest.mock('@/features/workspace-scheduling/pending', () => ({
  loadPendingWorkspaceBooking: jest.fn(),
  savePendingWorkspaceBooking: jest.fn(),
  clearPendingWorkspaceBooking: jest.fn(),
}));
const userId = '51000000-0000-4000-8000-000000000001';
const workspaceId = '61000000-0000-4000-8000-000000000001';
const command: PendingWorkspaceBooking = {
  clientRecordIds: ['71000000-0000-4000-8000-000000000001'],
  startsAtUtc: '2026-10-05T10:00:00.000Z',
  endsAtUtc: '2026-10-05T11:00:00.000Z',
  collisionAcknowledged: false,
  requestId: 'a1000000-0000-4000-8000-000000000001',
};
const result = {
  created: true,
  bookingIds: ['81000000-0000-4000-8000-000000000001'],
  groupSessionId: null,
  requiresOverlapAcknowledgement: false,
  overlaps: [],
  replayed: false,
};
const execute = jest.fn();
const save = jest.mocked(savePendingWorkspaceBooking);
const load = jest.mocked(loadPendingWorkspaceBooking);
const clear = jest.mocked(clearPendingWorkspaceBooking);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(createWorkspaceBookingOperation).mockReturnValue({ execute });
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
  const pending = submitWorkspaceBooking(userId, workspaceId, command);
  await Promise.resolve();
  expect(execute).not.toHaveBeenCalled();
  saved();
  expect(await pending).toEqual(result);
  expect(clear).toHaveBeenCalledWith(userId, workspaceId, command.requestId);
});
test('does not send when storage fails or another command is unresolved', async () => {
  save.mockRejectedValueOnce(new Error('unresolved'));
  await expect(
    submitWorkspaceBooking(userId, workspaceId, command),
  ).rejects.toThrow('unresolved');
  expect(execute).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
});
test('keeps the pending command after a lost response', async () => {
  execute.mockRejectedValueOnce(new Error('response lost'));
  await expect(
    submitWorkspaceBooking(userId, workspaceId, command),
  ).rejects.toThrow('response lost');
  expect(clear).not.toHaveBeenCalled();
  execute.mockResolvedValueOnce({ ...result, replayed: true });
  expect(await resumeWorkspaceBooking(userId, workspaceId)).toMatchObject({
    replayed: true,
  });
  expect(createWorkspaceBookingOperation).toHaveBeenNthCalledWith(2, {
    ...command,
    expectedUserId: userId,
  });
});
test('recovers a receipt when local cleanup fails after server creation', async () => {
  clear.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(
    submitWorkspaceBooking(userId, workspaceId, command),
  ).rejects.toThrow('storage unavailable');
  execute.mockResolvedValueOnce({ ...result, replayed: true });
  expect(await resumeWorkspaceBooking(userId, workspaceId)).toMatchObject({
    replayed: true,
  });
});
test('releases a validated overlap warning without automatically acknowledging', async () => {
  execute.mockResolvedValueOnce({
    ...result,
    created: false,
    bookingIds: [],
    requiresOverlapAcknowledgement: true,
  });
  expect(
    await submitWorkspaceBooking(userId, workspaceId, command),
  ).toMatchObject({ created: false });
  expect(clear).toHaveBeenCalledWith(userId, workspaceId, command.requestId);
  expect(createWorkspaceBookingOperation).toHaveBeenCalledTimes(1);
  expect(createWorkspaceBookingOperation).toHaveBeenCalledWith(
    expect.objectContaining({ collisionAcknowledged: false }),
  );
});
test('does nothing when the current scope has no pending command', async () => {
  load.mockResolvedValueOnce(null);
  expect(await resumeWorkspaceBooking(userId, workspaceId)).toBeNull();
  expect(save).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
test('corrupt saved data blocks recovery', async () => {
  load.mockRejectedValueOnce(new Error('invalid'));
  await expect(resumeWorkspaceBooking(userId, workspaceId)).rejects.toThrow(
    'invalid',
  );
  expect(execute).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
});

test('restores selected template and exact revision after a lost response', async () => {
  const selected = {
    ...command,
    plan: { templateId: workspaceId, expectedTemplateRevision: 3 },
  };
  load.mockResolvedValue(selected);
  execute.mockRejectedValueOnce(new Error('response lost'));
  await expect(
    submitWorkspaceBooking(userId, workspaceId, selected),
  ).rejects.toThrow('response lost');
  expect(clear).not.toHaveBeenCalled();
  execute.mockResolvedValueOnce({ ...result, replayed: true });
  await resumeWorkspaceBooking(userId, workspaceId);
  expect(createWorkspaceBookingOperation).toHaveBeenNthCalledWith(2, {
    ...selected,
    expectedUserId: userId,
  });
});

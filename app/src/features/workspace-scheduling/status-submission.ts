import { resolveWorkspaceBookingStatusRequest } from './request-resolution';
import { createWorkspaceBookingStatusOperation } from './status-operation';
import {
  clearPendingWorkspaceBookingStatus,
  loadPendingWorkspaceBookingStatus,
  savePendingWorkspaceBookingStatus,
  type PendingWorkspaceBookingStatus,
} from './status-pending';

export async function submitWorkspaceBookingStatus(
  userId: string,
  workspaceId: string,
  command: PendingWorkspaceBookingStatus,
) {
  const operation = createWorkspaceBookingStatusOperation({
    ...command,
    expectedUserId: userId,
  });
  const requestId = command.requestId;
  await savePendingWorkspaceBookingStatus(userId, workspaceId, command);
  const result = await operation.execute();
  await clearPendingWorkspaceBookingStatus(userId, workspaceId, requestId);
  return result;
}

export async function resumeWorkspaceBookingStatus(
  userId: string,
  workspaceId: string,
) {
  const command = await loadPendingWorkspaceBookingStatus(userId, workspaceId);
  return command
    ? submitWorkspaceBookingStatus(userId, workspaceId, command)
    : null;
}

export async function resolvePendingWorkspaceBookingStatus(
  userId: string,
  workspaceId: string,
) {
  const command = await loadPendingWorkspaceBookingStatus(userId, workspaceId);
  if (!command) return null;
  const resolution = await resolveWorkspaceBookingStatusRequest(
    { ...command, expectedUserId: userId },
    workspaceId,
  );
  await clearPendingWorkspaceBookingStatus(
    userId,
    workspaceId,
    command.requestId,
  );
  return resolution;
}

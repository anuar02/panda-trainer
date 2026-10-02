import { createWorkspaceBookingOperation } from './create-operation';
import {
  clearPendingWorkspaceBooking,
  loadPendingWorkspaceBooking,
  savePendingWorkspaceBooking,
  type PendingWorkspaceBooking,
} from './pending';

export async function submitWorkspaceBooking(
  userId: string,
  workspaceId: string,
  command: PendingWorkspaceBooking,
) {
  const operation = createWorkspaceBookingOperation({
    ...command,
    expectedUserId: userId,
  });
  const requestId = command.requestId;
  await savePendingWorkspaceBooking(userId, workspaceId, command);
  const result = await operation.execute();
  await clearPendingWorkspaceBooking(userId, workspaceId, requestId);
  return result;
}

export async function resumeWorkspaceBooking(
  userId: string,
  workspaceId: string,
) {
  const command = await loadPendingWorkspaceBooking(userId, workspaceId);
  return command ? submitWorkspaceBooking(userId, workspaceId, command) : null;
}

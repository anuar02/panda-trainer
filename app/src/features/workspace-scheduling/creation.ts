import {
  createBookingSessionFence,
  type BookingSessionFence,
} from './creation-session';
import { createWorkspaceBookingOperation } from './create-operation';
import {
  clearPendingWorkspaceBooking,
  loadPendingWorkspaceBooking,
  savePendingWorkspaceBooking,
  type PendingWorkspaceBooking,
} from './pending';

async function submitWithFence(
  userId: string,
  workspaceId: string,
  command: PendingWorkspaceBooking,
  fence: BookingSessionFence,
) {
  const saved: PendingWorkspaceBooking = {
    ...command,
    clientRecordIds: [...command.clientRecordIds],
    ...(command.plan ? { plan: { ...command.plan } } : {}),
  };
  const operation = createWorkspaceBookingOperation(
    {
      ...saved,
      expectedUserId: userId,
    },
    fence,
  );
  await fence.assertCurrent();
  await savePendingWorkspaceBooking(userId, workspaceId, saved);
  await fence.assertCurrent();
  const result = await operation.execute();
  await fence.assertCurrent();
  const cleared = await clearPendingWorkspaceBooking(
    userId,
    workspaceId,
    saved.requestId,
    fence.guard,
  );
  try {
    await fence.assertCurrent();
  } catch (error) {
    if (cleared) {
      await savePendingWorkspaceBooking(userId, workspaceId, saved).catch(
        () => {},
      );
    }
    throw error;
  }
  return result;
}

export async function submitWorkspaceBooking(
  userId: string,
  workspaceId: string,
  command: PendingWorkspaceBooking,
  isCurrent: () => boolean = () => true,
) {
  const fence = createBookingSessionFence(userId, isCurrent);
  try {
    return await submitWithFence(userId, workspaceId, command, fence);
  } catch (error) {
    await fence.assertCurrent();
    throw error;
  } finally {
    fence.dispose();
  }
}

export async function resumeWorkspaceBooking(
  userId: string,
  workspaceId: string,
  isCurrent: () => boolean = () => true,
) {
  const fence = createBookingSessionFence(userId, isCurrent);
  try {
    await fence.assertCurrent();
    const command = await loadPendingWorkspaceBooking(userId, workspaceId);
    await fence.assertCurrent();
    return command
      ? await submitWithFence(userId, workspaceId, command, fence)
      : null;
  } catch (error) {
    await fence.assertCurrent();
    throw error;
  } finally {
    fence.dispose();
  }
}

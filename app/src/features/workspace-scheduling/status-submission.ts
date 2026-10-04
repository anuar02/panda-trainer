import { assertSchedulingCommandTarget } from './command-target';
import {
  createSchedulingCommandFence,
  schedulingCommandError,
  type SchedulingCommandFence,
} from './command-session';
import {
  createWorkspaceBookingStatusOperation,
  WorkspaceBookingStatusError,
  type WorkspaceBookingStatusResult,
} from './status-operation';
import type { BookingRequestResolution } from './request-resolution';
import { resolveWorkspaceBookingStatusRequest } from './request-resolution';
import {
  loadPendingWorkspaceBookingStatus,
  savePendingWorkspaceBookingStatus,
  retainPendingWorkspaceBookingStatus,
  PendingWorkspaceBookingStatusError,
  clearPendingWorkspaceBookingStatus,
} from './status-pending';
import type { PendingWorkspaceBookingStatus } from './status-pending';

async function complete(
  userId: string,
  workspaceId: string,
  command: PendingWorkspaceBookingStatus,
  fence: SchedulingCommandFence,
  clientRecordId?: string,
): Promise<WorkspaceBookingStatusResult>;
async function complete(
  userId: string,
  workspaceId: string,
  command: PendingWorkspaceBookingStatus,
  fence: SchedulingCommandFence,
  clientRecordId: string | undefined,
  resolution: true,
): Promise<BookingRequestResolution<WorkspaceBookingStatusResult>>;
async function complete(
  userId: string,
  workspaceId: string,
  command: PendingWorkspaceBookingStatus,
  fence: SchedulingCommandFence,
  clientRecordId?: string,
  resolution = false,
) {
  const saved: PendingWorkspaceBookingStatus = {
    action: command.action,
    bookingId: command.bookingId.toLowerCase(),
    expectedRevision: command.expectedRevision,
    requestId: command.requestId.toLowerCase(),
  };
  const operation = createWorkspaceBookingStatusOperation(
    { ...saved, expectedUserId: userId },
    fence,
  );
  await fence.assertCurrent();
  if (!resolution) {
    await savePendingWorkspaceBookingStatus(
      userId,
      workspaceId,
      saved,
      fence.guard,
    );
    await fence.assertCurrent();
  }
  await assertSchedulingCommandTarget(
    fence,
    workspaceId,
    saved.bookingId,
    undefined,
    clientRecordId,
  );
  const result = resolution
    ? await resolveWorkspaceBookingStatusRequest(
        { ...saved, expectedUserId: userId },
        workspaceId,
        fence,
      )
    : await operation.execute();
  await fence.assertCurrent();
  let cleared = false;
  try {
    cleared = await clearPendingWorkspaceBookingStatus(
      userId,
      workspaceId,
      saved.requestId,
      fence.guard,
      saved,
    );
  } catch (error) {
    await retainPendingWorkspaceBookingStatus(userId, workspaceId, saved).catch(
      () => {},
    );
    throw error;
  }
  try {
    await fence.assertCurrent();
  } catch (error) {
    if (cleared)
      await retainPendingWorkspaceBookingStatus(
        userId,
        workspaceId,
        saved,
      ).catch(() => {});
    throw error;
  }
  return result;
}
async function run<T>(
  userId: string,
  isCurrent: () => boolean,
  action: (fence: SchedulingCommandFence) => Promise<T>,
) {
  let fence: SchedulingCommandFence | undefined;
  try {
    fence = createSchedulingCommandFence(userId, isCurrent);
    return await action(fence);
  } catch (error) {
    try {
      await fence?.assertCurrent();
    } catch (failure) {
      throw new WorkspaceBookingStatusError(schedulingCommandError(failure));
    }
    if (
      error instanceof WorkspaceBookingStatusError ||
      error instanceof PendingWorkspaceBookingStatusError
    )
      throw error;
    throw new WorkspaceBookingStatusError(schedulingCommandError(error));
  } finally {
    fence?.dispose();
  }
}
export async function submitWorkspaceBookingStatus(
  userId: string,
  workspaceId: string,
  command: PendingWorkspaceBookingStatus,
  isCurrent: () => boolean = () => true,
  clientRecordId?: string,
) {
  return await run(userId, isCurrent, (fence) =>
    complete(userId, workspaceId, command, fence, clientRecordId),
  );
}
export async function resumeWorkspaceBookingStatus(
  userId: string,
  workspaceId: string,
  isCurrent: () => boolean = () => true,
  clientRecordId?: string,
) {
  return await run(userId, isCurrent, async (fence) => {
    await fence.assertCurrent();
    const command = await loadPendingWorkspaceBookingStatus(
      userId,
      workspaceId,
      fence.guard,
    );
    await fence.assertCurrent();
    return command
      ? complete(userId, workspaceId, command, fence, clientRecordId)
      : null;
  });
}
export async function resolvePendingWorkspaceBookingStatus(
  userId: string,
  workspaceId: string,
  isCurrent: () => boolean = () => true,
  clientRecordId?: string,
) {
  return await run(userId, isCurrent, async (fence) => {
    await fence.assertCurrent();
    const command = await loadPendingWorkspaceBookingStatus(
      userId,
      workspaceId,
      fence.guard,
    );
    await fence.assertCurrent();
    return command
      ? complete(userId, workspaceId, command, fence, clientRecordId, true)
      : null;
  });
}

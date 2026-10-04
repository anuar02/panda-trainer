import { assertSchedulingCommandTarget } from './command-target';
import {
  createSchedulingCommandFence,
  schedulingCommandError,
  type SchedulingCommandFence,
} from './command-session';
import {
  createWorkspaceProposalOperation,
  WorkspaceProposalError,
  type WorkspaceProposalResult,
  type WorkspaceProposalCommand,
} from './proposal-operation';
import type { BookingRequestResolution } from './request-resolution';
import { resolveWorkspaceProposalRequest } from './request-resolution';
import {
  loadPendingWorkspaceProposal,
  savePendingWorkspaceProposal,
  retainPendingWorkspaceProposal,
  PendingWorkspaceProposalError,
  clearPendingWorkspaceProposal,
  snapshotWorkspaceProposalCommand,
} from './proposal-pending';

async function complete(
  userId: string,
  workspaceId: string,
  command: WorkspaceProposalCommand,
  fence: SchedulingCommandFence,
  clientRecordId?: string,
): Promise<WorkspaceProposalResult>;
async function complete(
  userId: string,
  workspaceId: string,
  command: WorkspaceProposalCommand,
  fence: SchedulingCommandFence,
  clientRecordId: string | undefined,
  resolution: true,
): Promise<BookingRequestResolution<WorkspaceProposalResult>>;
async function complete(
  userId: string,
  workspaceId: string,
  command: WorkspaceProposalCommand,
  fence: SchedulingCommandFence,
  clientRecordId?: string,
  resolution = false,
) {
  const saved = snapshotWorkspaceProposalCommand(command);
  const operation = createWorkspaceProposalOperation(saved, userId, fence);
  await fence.assertCurrent();
  if (!resolution) {
    await savePendingWorkspaceProposal(userId, workspaceId, saved, fence.guard);
    await fence.assertCurrent();
  }
  await assertSchedulingCommandTarget(
    fence,
    workspaceId,
    saved.bookingId,
    saved.action === 'propose' ? undefined : saved.proposalId,
    clientRecordId,
  );
  const result = resolution
    ? await resolveWorkspaceProposalRequest(saved, userId, workspaceId, fence)
    : await operation.execute();
  await fence.assertCurrent();
  let cleared = false;
  try {
    cleared = await clearPendingWorkspaceProposal(
      userId,
      workspaceId,
      saved.requestId,
      fence.guard,
      saved,
    );
  } catch (error) {
    await retainPendingWorkspaceProposal(userId, workspaceId, saved).catch(
      () => {},
    );
    throw error;
  }
  try {
    await fence.assertCurrent();
  } catch (error) {
    if (cleared)
      await retainPendingWorkspaceProposal(userId, workspaceId, saved).catch(
        () => {},
      );
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
      throw new WorkspaceProposalError(schedulingCommandError(failure));
    }
    if (
      error instanceof WorkspaceProposalError ||
      error instanceof PendingWorkspaceProposalError
    )
      throw error;
    throw new WorkspaceProposalError(schedulingCommandError(error));
  } finally {
    fence?.dispose();
  }
}
export async function submitWorkspaceProposal(
  userId: string,
  workspaceId: string,
  command: WorkspaceProposalCommand,
  isCurrent: () => boolean = () => true,
  clientRecordId?: string,
) {
  return await run(userId, isCurrent, (fence) =>
    complete(userId, workspaceId, command, fence, clientRecordId),
  );
}
export async function resumeWorkspaceProposal(
  userId: string,
  workspaceId: string,
  isCurrent: () => boolean = () => true,
  clientRecordId?: string,
) {
  return await run(userId, isCurrent, async (fence) => {
    await fence.assertCurrent();
    const command = await loadPendingWorkspaceProposal(
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
export async function resolvePendingWorkspaceProposal(
  userId: string,
  workspaceId: string,
  isCurrent: () => boolean = () => true,
  clientRecordId?: string,
) {
  return await run(userId, isCurrent, async (fence) => {
    await fence.assertCurrent();
    const command = await loadPendingWorkspaceProposal(
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

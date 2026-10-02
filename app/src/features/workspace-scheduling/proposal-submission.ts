import {
  createWorkspaceProposalOperation,
  type WorkspaceProposalCommand,
} from './proposal-operation';
import {
  savePendingWorkspaceProposal,
  loadPendingWorkspaceProposal,
  clearPendingWorkspaceProposal,
} from './proposal-pending';
export async function submitWorkspaceProposal(
  userId: string,
  workspaceId: string,
  command: WorkspaceProposalCommand,
) {
  const operation = createWorkspaceProposalOperation(command, userId);
  const requestId = command.requestId;
  await savePendingWorkspaceProposal(userId, workspaceId, command);
  const result = await operation.execute();
  await clearPendingWorkspaceProposal(userId, workspaceId, requestId);
  return result;
}
export async function resumeWorkspaceProposal(
  userId: string,
  workspaceId: string,
) {
  const command = await loadPendingWorkspaceProposal(userId, workspaceId);
  return command ? submitWorkspaceProposal(userId, workspaceId, command) : null;
}

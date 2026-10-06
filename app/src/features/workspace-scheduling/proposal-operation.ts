import {
  createSchedulingCommandFence,
  schedulingCommandError,
  type SchedulingCommandFence,
} from './command-session';
import {
  validWorkspaceProposalCommand,
  snapshotWorkspaceProposalCommand,
} from './proposal-pending';

export type WorkspaceProposalCommand = {
  bookingId: string;
  expectedBookingRevision: number;
  requestId: string;
} & (
  | { action: 'propose'; proposedStartsAtUtc: string }
  | {
      action: 'counter';
      proposalId: string;
      expectedProposalRevision: number;
      proposedStartsAtUtc: string;
    }
  | {
      action: 'accept' | 'decline' | 'withdraw';
      proposalId: string;
      expectedProposalRevision: number;
    }
);
export type WorkspaceProposalResult = {
  proposalId: string;
  proposalRevision: number;
  proposalStatus: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  bookingId: string;
  bookingRevision: number;
  bookingStatus: 'proposed' | 'confirmed';
  startsAtUtc: string;
  endsAtUtc: string;
  replayed: boolean;
};
export class WorkspaceProposalError extends Error {
  constructor(
    readonly code:
      | 'invalidInput'
      | 'configuration'
      | 'unavailable'
      | 'conflict'
      | 'invalidState'
      | 'request',
  ) {
    super('Booking reschedule command failed');
    this.name = 'WorkspaceProposalError';
  }
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export function parseWorkspaceProposalResult(
  value: unknown,
  command: WorkspaceProposalCommand,
): WorkspaceProposalResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new WorkspaceProposalError('request');
  const row = value as Record<string, unknown>;
  const status =
    command.action === 'propose' || command.action === 'counter'
      ? 'pending'
      : command.action === 'accept'
        ? 'accepted'
        : command.action === 'decline'
          ? 'declined'
          : 'withdrawn';
  if (
    !uuid(row.proposal_id) ||
    !uuid(row.booking_id) ||
    row.booking_id.toLowerCase() !== command.bookingId ||
    (command.action !== 'propose' &&
      row.proposal_id.toLowerCase() !== command.proposalId) ||
    row.proposal_revision !==
      (command.action === 'propose'
        ? 1
        : command.expectedProposalRevision + 1) ||
    row.booking_revision !==
      command.expectedBookingRevision + (command.action === 'accept' ? 1 : 0) ||
    row.proposal_status !== status ||
    (row.booking_status !== 'proposed' && row.booking_status !== 'confirmed') ||
    typeof row.replayed !== 'boolean' ||
    typeof row.starts_at !== 'string' ||
    typeof row.ends_at !== 'string' ||
    !Number.isFinite(Date.parse(row.starts_at)) ||
    !Number.isFinite(Date.parse(row.ends_at)) ||
    Date.parse(row.ends_at) <= Date.parse(row.starts_at)
  )
    throw new WorkspaceProposalError('request');
  return {
    proposalId: row.proposal_id,
    proposalRevision: row.proposal_revision as number,
    proposalStatus: status,
    bookingId: row.booking_id,
    bookingRevision: row.booking_revision as number,
    bookingStatus: row.booking_status,
    startsAtUtc: new Date(row.starts_at).toISOString(),
    endsAtUtc: new Date(row.ends_at).toISOString(),
    replayed: row.replayed,
  };
}
export function createWorkspaceProposalOperation(
  input: WorkspaceProposalCommand,
  expectedUserId: string,
  suppliedFence?: SchedulingCommandFence,
): { execute(): Promise<WorkspaceProposalResult>; dispose?: () => void } {
  if (!validWorkspaceProposalCommand(input) || !uuid(expectedUserId))
    throw new WorkspaceProposalError('invalidInput');
  const command = snapshotWorkspaceProposalCommand(input);
  const userId = expectedUserId.toLowerCase();
  let pending: Promise<WorkspaceProposalResult> | null = null;
  let fence = suppliedFence;
  return {
    dispose: () => {
      if (!suppliedFence) fence?.dispose();
    },
    execute: (): Promise<WorkspaceProposalResult> => {
      if (pending) {
        const cached = pending;
        return (async () => {
          await fence?.assertCurrent();
          const result = await cached;
          await fence?.assertCurrent();
          return result;
        })().catch(async (error: unknown) => {
          if (error instanceof WorkspaceProposalError) throw error;
          throw new WorkspaceProposalError(schedulingCommandError(error));
        });
      }
      pending = (async () => {
        fence ??= createSchedulingCommandFence(userId);
        await fence.assertCurrent();
        const client = fence.client;
        const token = fence.accessToken;
        const common = {
          p_expected_booking_revision: command.expectedBookingRevision,
          p_request_id: command.requestId,
        };
        const request =
          command.action === 'propose'
            ? client.rpc('propose_booking_reschedule', {
                ...common,
                p_booking_id: command.bookingId,
                p_proposed_starts_at: command.proposedStartsAtUtc,
              })
            : command.action === 'counter'
              ? client.rpc('counter_booking_reschedule', {
                  ...common,
                  p_proposal_id: command.proposalId,
                  p_expected_proposal_revision:
                    command.expectedProposalRevision,
                  p_proposed_starts_at: command.proposedStartsAtUtc,
                })
              : client.rpc(
                  command.action === 'accept'
                    ? 'accept_booking_reschedule'
                    : command.action === 'decline'
                      ? 'decline_booking_reschedule'
                      : 'withdraw_booking_reschedule',
                  {
                    ...common,
                    p_proposal_id: command.proposalId,
                    p_expected_proposal_revision:
                      command.expectedProposalRevision,
                  },
                );
        const { data, error } = await request.setHeader(
          'Authorization',
          `Bearer ${token}`,
        );
        await fence.assertCurrent();
        if (error)
          throw new WorkspaceProposalError(
            error.code === '22023'
              ? 'invalidInput'
              : error.code === '40001'
                ? 'conflict'
                : error.code === '55000'
                  ? 'invalidState'
                  : error.code === '42501' || error.code === 'P0002'
                    ? 'unavailable'
                    : 'request',
          );
        return parseWorkspaceProposalResult(data, command);
      })().catch(async (error: unknown) => {
        pending = null;
        if (fence)
          await fence.assertCurrent().catch((failure: unknown) => {
            throw new WorkspaceProposalError(schedulingCommandError(failure));
          });
        if (error instanceof WorkspaceProposalError) throw error;
        throw new WorkspaceProposalError(schedulingCommandError(error));
      });
      return pending;
    },
  };
}

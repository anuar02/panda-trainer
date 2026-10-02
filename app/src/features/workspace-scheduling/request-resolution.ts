import { getSupabaseClient } from '@/features/auth/client';
import {
  createWorkspaceBookingStatusOperation,
  parseWorkspaceBookingStatusResult,
  WorkspaceBookingStatusError,
  type WorkspaceBookingStatusInput,
  type WorkspaceBookingStatusResult,
} from './status-operation';
import {
  createWorkspaceProposalOperation,
  parseWorkspaceProposalResult,
  WorkspaceProposalError,
  type WorkspaceProposalCommand,
  type WorkspaceProposalResult,
} from './proposal-operation';
import { snapshotWorkspaceProposalCommand } from './proposal-pending';
import type { Database } from '@/lib/database.types';

export type BookingRequestResolution<Result> =
  | { outcome: 'abandoned'; result: null }
  | { outcome: 'succeeded'; result: Result };
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const samePayload = (value: unknown, expected: Record<string, unknown>) =>
  record(value) &&
  Object.keys(value).length === Object.keys(expected).length &&
  Object.entries(expected).every(([key, item]) => value[key] === item);
function envelope(
  value: unknown,
  family: string,
  workspaceId: string,
  bookingId: string,
  requestId: string,
  payload: Record<string, unknown>,
) {
  if (
    !record(value) ||
    value.command_family !== family ||
    value.workspace_id !== workspaceId.toLowerCase() ||
    value.booking_id !== bookingId.toLowerCase() ||
    value.request_id !== requestId.toLowerCase() ||
    !samePayload(value.canonical_payload, payload) ||
    (value.outcome !== 'succeeded' && value.outcome !== 'abandoned') ||
    (value.outcome === 'abandoned' && value.result !== null) ||
    (value.outcome === 'succeeded' &&
      (!record(value.result) || value.result.replayed !== true))
  )
    throw new Error('Invalid booking request resolution');
  return value;
}
async function authenticatedClient(userId: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('configuration');
  const session = await client.auth.getSession();
  const token = session.data.session?.access_token;
  if (
    session.error ||
    session.data.session?.user.id.toLowerCase() !== userId.toLowerCase() ||
    !token
  )
    throw new Error('unavailable');
  return { client, token };
}
const rpcError = (code: string) =>
  code === '22023'
    ? 'invalidInput'
    : code === '42501' || code === 'P0002'
      ? 'unavailable'
      : 'request';
export async function resolveWorkspaceBookingStatusRequest(
  input: WorkspaceBookingStatusInput,
  workspaceId: string,
): Promise<BookingRequestResolution<WorkspaceBookingStatusResult>> {
  createWorkspaceBookingStatusOperation(input);
  const saved = { ...input };
  try {
    const { client, token } = await authenticatedClient(saved.expectedUserId);
    const { data, error } = await client
      .rpc('resolve_booking_status_request', {
        p_command: saved.action,
        p_booking_id: saved.bookingId.toLowerCase(),
        p_expected_revision: saved.expectedRevision,
        p_request_id: saved.requestId.toLowerCase(),
      })
      .setHeader('Authorization', `Bearer ${token}`);
    if (error) throw new WorkspaceBookingStatusError(rpcError(error.code));
    const value = envelope(
      data,
      'status',
      workspaceId,
      saved.bookingId,
      saved.requestId,
      {
        command: saved.action,
        booking_id: saved.bookingId.toLowerCase(),
        expected_revision: saved.expectedRevision,
      },
    );
    return value.outcome === 'abandoned'
      ? { outcome: 'abandoned', result: null }
      : {
          outcome: 'succeeded',
          result: parseWorkspaceBookingStatusResult(value.result, saved),
        };
  } catch (error) {
    if (error instanceof WorkspaceBookingStatusError) throw error;
    throw new WorkspaceBookingStatusError(
      error instanceof Error &&
        (error.message === 'configuration' || error.message === 'unavailable')
        ? error.message
        : 'request',
    );
  }
}
export async function resolveWorkspaceProposalRequest(
  input: WorkspaceProposalCommand,
  userId: string,
  workspaceId: string,
): Promise<BookingRequestResolution<WorkspaceProposalResult>> {
  createWorkspaceProposalOperation(input, userId);
  const command = snapshotWorkspaceProposalCommand(input);
  const proposalId = command.action === 'propose' ? null : command.proposalId;
  const proposalRevision =
    command.action === 'propose' ? null : command.expectedProposalRevision;
  const starts =
    command.action === 'propose' || command.action === 'counter'
      ? command.proposedStartsAtUtc
      : null;
  try {
    const { client, token } = await authenticatedClient(userId);
    const args = {
      p_command: command.action,
      p_booking_id: command.action === 'propose' ? command.bookingId : null,
      p_proposal_id: proposalId,
      p_expected_booking_revision: command.expectedBookingRevision,
      p_expected_proposal_revision: proposalRevision,
      p_proposed_starts_at: starts,
      p_request_id: command.requestId,
    } as Database['public']['Functions']['resolve_booking_reschedule_request']['Args'];
    const { data, error } = await client
      .rpc('resolve_booking_reschedule_request', args)
      .setHeader('Authorization', `Bearer ${token}`);
    if (error) throw new WorkspaceProposalError(rpcError(error.code));
    const value = envelope(
      data,
      'reschedule',
      workspaceId,
      command.bookingId,
      command.requestId,
      {
        command: command.action,
        booking_id: command.action === 'propose' ? command.bookingId : null,
        proposal_id: proposalId,
        expected_booking_revision: command.expectedBookingRevision,
        expected_proposal_revision: proposalRevision,
        proposed_starts_epoch:
          starts === null ? null : Date.parse(starts) / 1000,
      },
    );
    return value.outcome === 'abandoned'
      ? { outcome: 'abandoned', result: null }
      : {
          outcome: 'succeeded',
          result: parseWorkspaceProposalResult(value.result, command),
        };
  } catch (error) {
    if (error instanceof WorkspaceProposalError) throw error;
    throw new WorkspaceProposalError(
      error instanceof Error &&
        (error.message === 'configuration' || error.message === 'unavailable')
        ? error.message
        : 'request',
    );
  }
}

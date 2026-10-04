import {
  createSchedulingCommandFence,
  schedulingCommandError,
  type SchedulingCommandFence,
} from './command-session';
import type { Database } from '@/lib/database.types';

export type WorkspaceBookingStatusErrorCode =
  | 'configuration'
  | 'invalidInput'
  | 'unavailable'
  | 'conflict'
  | 'invalidState'
  | 'request';

export class WorkspaceBookingStatusError extends Error {
  constructor(public readonly code: WorkspaceBookingStatusErrorCode) {
    super(code);
    this.name = 'WorkspaceBookingStatusError';
  }
}

export type WorkspaceBookingStatusInput = {
  action: 'confirm' | 'cancel';
  bookingId: string;
  expectedRevision: number;
  requestId: string;
  expectedUserId: string;
};

export type WorkspaceBookingStatusResult = {
  bookingId: string;
  revision: number;
  status: 'confirmed' | 'cancelled_by_client' | 'cancelled_by_trainer';
  replayed: boolean;
};

const validUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

export const createWorkspaceBookingStatusOperation = (
  input: WorkspaceBookingStatusInput,
  suppliedFence?: SchedulingCommandFence,
): {
  execute(): Promise<WorkspaceBookingStatusResult>;
  dispose?: () => void;
} => {
  if (
    (input.action !== 'confirm' && input.action !== 'cancel') ||
    !validUuid(input.bookingId) ||
    !validUuid(input.requestId) ||
    !validUuid(input.expectedUserId) ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 1 ||
    input.expectedRevision >= 2147483647
  )
    throw new WorkspaceBookingStatusError('invalidInput');
  const action = input.action;
  const expectedUserId = input.expectedUserId.toLowerCase();
  const args: Database['public']['Functions']['confirm_booking']['Args'] = {
    p_booking_id: input.bookingId.toLowerCase(),
    p_expected_revision: input.expectedRevision,
    p_request_id: input.requestId.toLowerCase(),
  };
  let pending: Promise<WorkspaceBookingStatusResult> | null = null;
  let fence = suppliedFence;
  return {
    dispose: () => {
      if (!suppliedFence) fence?.dispose();
    },
    execute: (): Promise<WorkspaceBookingStatusResult> => {
      if (pending) {
        const cached = pending;
        return (async () => {
          await fence?.assertCurrent();
          const result = await cached;
          await fence?.assertCurrent();
          return result;
        })().catch((error: unknown) => {
          if (error instanceof WorkspaceBookingStatusError) throw error;
          throw new WorkspaceBookingStatusError(schedulingCommandError(error));
        });
      }
      pending = (async (): Promise<WorkspaceBookingStatusResult> => {
        try {
          fence ??= createSchedulingCommandFence(expectedUserId);
          await fence.assertCurrent();
          const client = fence.client;
          const token = fence.accessToken;
          const { data, error } = await client
            .rpc(
              action === 'confirm' ? 'confirm_booking' : 'cancel_booking',
              args,
            )
            .setHeader('Authorization', `Bearer ${token}`);
          await fence.assertCurrent();
          if (error)
            throw new WorkspaceBookingStatusError(
              error.code === '22023'
                ? 'invalidInput'
                : error.code === '42501' || error.code === 'P0002'
                  ? 'unavailable'
                  : error.code === '40001'
                    ? 'conflict'
                    : error.code === '55000'
                      ? 'invalidState'
                      : 'request',
            );
          return parseWorkspaceBookingStatusResult(data, {
            action,
            expectedUserId,
            bookingId: args.p_booking_id,
            expectedRevision: args.p_expected_revision,
            requestId: args.p_request_id,
          });
        } catch (error) {
          if (fence)
            await fence.assertCurrent().catch((failure: unknown) => {
              throw new WorkspaceBookingStatusError(
                schedulingCommandError(failure),
              );
            });
          if (error instanceof WorkspaceBookingStatusError) throw error;
          throw new WorkspaceBookingStatusError(schedulingCommandError(error));
        }
      })().catch((error: unknown) => {
        pending = null;
        throw error;
      });
      return pending;
    },
  };
};

export function parseWorkspaceBookingStatusResult(
  value: unknown,
  input: WorkspaceBookingStatusInput,
): WorkspaceBookingStatusResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new WorkspaceBookingStatusError('request');
  const row = value as Record<string, unknown>;
  if (
    !validUuid(row.booking_id) ||
    row.booking_id.toLowerCase() !== input.bookingId.toLowerCase() ||
    row.revision !== input.expectedRevision + 1 ||
    typeof row.replayed !== 'boolean' ||
    (row.status !== 'confirmed' &&
      row.status !== 'cancelled_by_client' &&
      row.status !== 'cancelled_by_trainer') ||
    (input.action === 'confirm'
      ? row.status !== 'confirmed'
      : row.status !== 'cancelled_by_client' &&
        row.status !== 'cancelled_by_trainer')
  )
    throw new WorkspaceBookingStatusError('request');
  return {
    bookingId: row.booking_id,
    revision: row.revision as number,
    status: row.status,
    replayed: row.replayed,
  };
}

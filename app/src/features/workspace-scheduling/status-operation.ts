import { getSupabaseClient } from '@/features/auth/client';
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
) => {
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
  return {
    execute: (): Promise<WorkspaceBookingStatusResult> => {
      if (pending) return pending;
      pending = (async (): Promise<WorkspaceBookingStatusResult> => {
        try {
          const client = getSupabaseClient();
          if (!client) throw new WorkspaceBookingStatusError('configuration');
          const session = await client.auth.getSession();
          const token = session.data.session?.access_token;
          if (
            session.error ||
            session.data.session?.user.id.toLowerCase() !== expectedUserId ||
            !token
          )
            throw new WorkspaceBookingStatusError('unavailable');
          const { data, error } = await client
            .rpc(
              action === 'confirm' ? 'confirm_booking' : 'cancel_booking',
              args,
            )
            .setHeader('Authorization', `Bearer ${token}`);
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
          if (
            typeof data !== 'object' ||
            data === null ||
            Array.isArray(data) ||
            !validUuid(data.booking_id) ||
            data.booking_id.toLowerCase() !== args.p_booking_id ||
            data.revision !== args.p_expected_revision + 1 ||
            typeof data.replayed !== 'boolean' ||
            (data.status !== 'confirmed' &&
              data.status !== 'cancelled_by_client' &&
              data.status !== 'cancelled_by_trainer') ||
            (action === 'confirm'
              ? data.status !== 'confirmed'
              : data.status !== 'cancelled_by_client' &&
                data.status !== 'cancelled_by_trainer')
          )
            throw new WorkspaceBookingStatusError('request');
          return {
            bookingId: data.booking_id,
            revision: data.revision,
            status: data.status,
            replayed: data.replayed,
          };
        } catch (error) {
          if (error instanceof WorkspaceBookingStatusError) throw error;
          throw new WorkspaceBookingStatusError('request');
        }
      })().catch((error: unknown) => {
        pending = null;
        throw error;
      });
      return pending;
    },
  };
};

import { getSupabaseClient } from '@/features/auth/client';
import type { Database } from '@/lib/database.types';
import { WorkspaceSchedulingError } from './service';

export type CreateWorkspaceBookingInput = {
  clientRecordIds: readonly string[];
  startsAtUtc: string;
  endsAtUtc: string;
  collisionAcknowledged: boolean;
  requestId: string;
  expectedUserId: string;
};

export type WorkspaceBookingOverlap = {
  bookingIds: string[];
  startsAtUtc: string;
  endsAtUtc: string;
};

export type CreateWorkspaceBookingResult = {
  created: boolean;
  requiresOverlapAcknowledgement: boolean;
  groupSessionId: string | null;
  bookingIds: string[];
  overlaps: WorkspaceBookingOverlap[];
  replayed: boolean;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validUuid = (value: unknown): value is string =>
  typeof value === 'string' && uuidPattern.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const ids = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every(validUuid) &&
  new Set(value.map((id) => id.toLowerCase())).size === value.length;
const canonicalUtc = (value: unknown): value is string =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const parseResult = (
  value: unknown,
  participantCount: number,
): CreateWorkspaceBookingResult => {
  const fail = (): never => {
    throw new WorkspaceSchedulingError('request');
  };
  if (
    !record(value) ||
    typeof value.created !== 'boolean' ||
    typeof value.replayed !== 'boolean' ||
    !ids(value.booking_ids) ||
    !Array.isArray(value.overlaps) ||
    (value.group_session_id !== null && !validUuid(value.group_session_id))
  )
    return fail();
  if (
    value.created
      ? value.booking_ids.length !== participantCount ||
        participantCount > 1 !== (value.group_session_id !== null) ||
        (value.requires_overlap_ack !== undefined &&
          value.requires_overlap_ack !== false)
      : value.requires_overlap_ack !== true ||
        value.booking_ids.length !== 0 ||
        value.group_session_id !== null ||
        value.replayed ||
        value.overlaps.length === 0
  )
    return fail();
  const overlaps = value.overlaps.map((overlap: unknown) => {
    if (
      !record(overlap) ||
      !ids(overlap.booking_ids) ||
      overlap.booking_ids.length === 0 ||
      typeof overlap.starts_at !== 'string' ||
      typeof overlap.ends_at !== 'string' ||
      !Number.isFinite(Date.parse(overlap.starts_at)) ||
      !Number.isFinite(Date.parse(overlap.ends_at)) ||
      Date.parse(overlap.ends_at) <= Date.parse(overlap.starts_at)
    )
      return fail();
    return {
      bookingIds: [...overlap.booking_ids],
      startsAtUtc: new Date(overlap.starts_at).toISOString(),
      endsAtUtc: new Date(overlap.ends_at).toISOString(),
    };
  });
  return {
    created: value.created,
    requiresOverlapAcknowledgement: !value.created,
    groupSessionId: value.group_session_id,
    bookingIds: [...value.booking_ids],
    overlaps,
    replayed: value.replayed,
  };
};

export const createWorkspaceBookingOperation = (
  input: CreateWorkspaceBookingInput,
) => {
  if (
    !ids(input.clientRecordIds) ||
    input.clientRecordIds.length === 0 ||
    !validUuid(input.requestId) ||
    !validUuid(input.expectedUserId) ||
    !canonicalUtc(input.startsAtUtc) ||
    !canonicalUtc(input.endsAtUtc) ||
    Date.parse(input.endsAtUtc) <= Date.parse(input.startsAtUtc) ||
    typeof input.collisionAcknowledged !== 'boolean'
  )
    throw new WorkspaceSchedulingError('invalidInput');
  const expectedUserId = input.expectedUserId.toLowerCase();
  const args: Database['public']['Functions']['create_booking_set']['Args'] = {
    p_client_record_ids: [...input.clientRecordIds]
      .map((id) => id.toLowerCase())
      .sort(),
    p_starts_at: input.startsAtUtc,
    p_ends_at: input.endsAtUtc,
    p_collision_ack: input.collisionAcknowledged,
    p_request_id: input.requestId,
  };
  let pending: Promise<CreateWorkspaceBookingResult> | null = null;
  return {
    execute: (): Promise<CreateWorkspaceBookingResult> => {
      if (pending) return pending;
      pending = (async () => {
        try {
          const client = getSupabaseClient();
          if (!client) throw new WorkspaceSchedulingError('configuration');
          const session = await client.auth.getSession();
          const token = session.data.session?.access_token;
          if (
            session.error ||
            session.data.session?.user.id.toLowerCase() !== expectedUserId ||
            !token
          )
            throw new WorkspaceSchedulingError('unavailable');
          const { data, error } = await client
            .rpc('create_booking_set', args)
            .setHeader('Authorization', `Bearer ${token}`);
          if (error)
            throw new WorkspaceSchedulingError(
              error.code === '22023'
                ? 'invalidInput'
                : error.code === '42501'
                  ? 'unavailable'
                  : 'request',
            );
          const result = parseResult(data, args.p_client_record_ids.length);
          if (!result.created) pending = null;
          return result;
        } catch (error) {
          pending = null;
          if (error instanceof WorkspaceSchedulingError) throw error;
          throw new WorkspaceSchedulingError('request');
        }
      })();
      return pending;
    },
  };
};

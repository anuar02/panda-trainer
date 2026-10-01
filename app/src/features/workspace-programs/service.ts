import * as Crypto from 'expo-crypto';
import { getSupabaseClient } from '@/features/auth/client';
import type { Database } from '@/lib/database.types';

export type WorkspaceProgramAssignmentErrorCode =
  | 'configuration'
  | 'invalidInput'
  | 'conflict'
  | 'notFound'
  | 'unavailable'
  | 'request';

export class WorkspaceProgramAssignmentError extends Error {
  constructor(readonly code: WorkspaceProgramAssignmentErrorCode) {
    super(
      code === 'configuration'
        ? 'Program assignment is unavailable'
        : code === 'invalidInput'
          ? 'Program assignment details are invalid'
          : code === 'conflict'
            ? 'The selected template changed. Reload it and try again'
            : code === 'notFound'
              ? 'The selected client or template is unavailable'
              : code === 'unavailable'
                ? 'Program assignment is unavailable'
                : 'Program assignment could not be completed',
    );
    this.name = 'WorkspaceProgramAssignmentError';
  }
}

export type WorkspaceProgramAssignmentInput = {
  clientRecordId: string;
  templateId: string;
  expectedTemplateRevision: number;
  expectedUserId: string;
  requestId?: string;
};

export type WorkspaceProgramAssignmentResult = {
  id: string;
  revision: number;
  replayed: boolean;
};

export type WorkspaceProgramAssignmentOperation = {
  execute: () => Promise<WorkspaceProgramAssignmentResult>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validUuid = (value: string) => uuidPattern.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseResult = (value: unknown): WorkspaceProgramAssignmentResult => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !validUuid(value.id) ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.replayed !== 'boolean'
  )
    throw new WorkspaceProgramAssignmentError('request');
  return {
    id: value.id,
    revision: value.revision,
    replayed: value.replayed,
  };
};

const rpcError = (code: string | undefined) =>
  new WorkspaceProgramAssignmentError(
    code === 'P0002' ? 'notFound' : code === '40001' ? 'conflict' : 'request',
  );

export const createAssignClientProgramOperation = (
  input: WorkspaceProgramAssignmentInput,
): WorkspaceProgramAssignmentOperation => {
  const requestId = input.requestId ?? Crypto.randomUUID();
  if (
    !validUuid(input.clientRecordId) ||
    !validUuid(input.templateId) ||
    !validUuid(input.expectedUserId) ||
    !validUuid(requestId) ||
    !Number.isSafeInteger(input.expectedTemplateRevision) ||
    input.expectedTemplateRevision < 1
  )
    throw new WorkspaceProgramAssignmentError('invalidInput');
  const expectedUserId = input.expectedUserId;
  const args = {
    p_client_record_id: input.clientRecordId,
    p_template_id: input.templateId,
    p_expected_template_revision: input.expectedTemplateRevision,
    p_request_id: requestId,
  } as Database['public']['Functions']['assign_client_program']['Args'];
  let result: Promise<WorkspaceProgramAssignmentResult> | null = null;
  return {
    execute: () => {
      if (result) return result;
      result = (async () => {
        try {
          const client = getSupabaseClient();
          if (!client)
            throw new WorkspaceProgramAssignmentError('configuration');
          const session = await client.auth.getSession();
          const accessToken = session.data.session?.access_token;
          if (
            session.error ||
            session.data.session?.user.id !== expectedUserId ||
            !accessToken
          )
            throw new WorkspaceProgramAssignmentError('unavailable');
          const { data, error } = await client
            .rpc('assign_client_program', args)
            .setHeader('Authorization', `Bearer ${accessToken}`);
          if (error) throw rpcError(error.code);
          return parseResult(data);
        } catch (error) {
          result = null;
          if (error instanceof WorkspaceProgramAssignmentError) throw error;
          throw new WorkspaceProgramAssignmentError('request');
        }
      })();
      return result;
    },
  };
};

import * as Crypto from 'expo-crypto';
import { getSupabaseClient } from '@/features/auth/client';

const tokenAlphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InvitationServiceErrorCode =
  'configuration' | 'invalidInput' | 'request' | 'unavailable';

export class InvitationServiceError extends Error {
  constructor(readonly code: InvitationServiceErrorCode) {
    super(
      code === 'configuration'
        ? 'Invitation links are unavailable'
        : code === 'invalidInput'
          ? 'Invitation data is invalid'
          : code === 'request'
            ? 'Invitation request could not be completed'
            : 'Invitation could not be completed',
    );
    this.name = 'InvitationServiceError';
  }
}

export type IssuedInvitation = {
  invitationId: string;
  expiresAt: string;
  active: boolean;
  replayed: boolean;
  link: string;
};

export type InvitationAcceptance = {
  clientRecordId: string;
  trainerName: string;
  acceptedAt: string;
  replayed: boolean;
};

export type InvitationIssueOperation = {
  execute: () => Promise<IssuedInvitation>;
};

export type InvitationRevokeOperation = {
  execute: () => Promise<{
    invitationId: string;
    revoked: true;
    replayed: boolean;
  }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isInvitationToken = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value))
    return false;
  const lastValue = tokenAlphabet.indexOf(value.at(-1) ?? '');
  return lastValue >= 0 && lastValue % 4 === 0;
};

const encodeBase64Url = (bytes: Uint8Array) => {
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? (bytes[index + 1] ?? 0) : 0;
    const third = hasThird ? (bytes[index + 2] ?? 0) : 0;
    encoded += tokenAlphabet[first >> 2];
    encoded += tokenAlphabet[((first & 3) << 4) | (second >> 4)];
    if (hasSecond)
      encoded += tokenAlphabet[((second & 15) << 2) | (third >> 6)];
    if (hasThird) encoded += tokenAlphabet[third & 63];
  }
  return encoded;
};

const createToken = async () => {
  try {
    const bytes = await Crypto.getRandomBytesAsync(32);
    const token = encodeBase64Url(bytes);
    if (!isInvitationToken(token)) throw new Error('token');
    return token;
  } catch {
    throw new InvitationServiceError('request');
  }
};

export const isInvitationBaseUrl = (baseUrl: string) => {
  try {
    const parsed = new URL(baseUrl);
    const localHttp =
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    const secureProduction = parsed.protocol === 'https:';
    return (localHttp || secureProduction) &&
      !baseUrl.includes('?') &&
      !baseUrl.includes('#') &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      (parsed.pathname === '/' || parsed.pathname === '')
      ? true
      : false;
  } catch {
    return false;
  }
};

const validBaseUrl = (baseUrl: string) => {
  if (!isInvitationBaseUrl(baseUrl)) return null;
  return new URL(baseUrl).origin;
};

export const buildInvitationLink = (token: string, baseUrl: string) => {
  if (!isInvitationToken(token))
    throw new InvitationServiceError('invalidInput');
  const origin = validBaseUrl(baseUrl);
  if (!origin) throw new InvitationServiceError('configuration');
  return `${origin}/invite/${token}`;
};

const validDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const rpcError = (code: string | undefined) =>
  new InvitationServiceError(code === 'P0002' ? 'unavailable' : 'request');

const parseIssueResult = (value: unknown) => {
  if (
    !isRecord(value) ||
    typeof value.invitation_id !== 'string' ||
    !uuidPattern.test(value.invitation_id) ||
    !validDate(value.expires_at) ||
    typeof value.active !== 'boolean' ||
    typeof value.replayed !== 'boolean'
  )
    throw new InvitationServiceError('unavailable');
  return {
    invitationId: value.invitation_id,
    expiresAt: value.expires_at,
    active: value.active,
    replayed: value.replayed,
  };
};

export const createIssueClientInvitationOperation = async (
  clientRecordId: string,
  baseUrl: string,
): Promise<InvitationIssueOperation> => {
  if (!uuidPattern.test(clientRecordId))
    throw new InvitationServiceError('invalidInput');
  const origin = validBaseUrl(baseUrl);
  if (!origin) throw new InvitationServiceError('configuration');
  const token = await createToken();
  const requestId = Crypto.randomUUID();
  let result: Promise<IssuedInvitation> | null = null;

  return {
    execute: () => {
      if (result) return result;
      result = (async () => {
        try {
          const client = getSupabaseClient();
          if (!client) throw new InvitationServiceError('configuration');
          const { data, error } = await client.rpc('issue_client_invitation', {
            p_client_record_id: clientRecordId,
            p_token: token,
            p_request_id: requestId,
          });
          if (error) throw rpcError(error.code);
          const parsed = parseIssueResult(data);
          return {
            ...parsed,
            link: `${origin}/invite/${token}`,
          };
        } catch (error) {
          result = null;
          if (error instanceof InvitationServiceError) throw error;
          throw new InvitationServiceError('request');
        }
      })();
      return result;
    },
  };
};

export const createRevokeClientInvitationOperation = (
  invitationId: string,
): InvitationRevokeOperation => {
  if (!uuidPattern.test(invitationId))
    throw new InvitationServiceError('invalidInput');
  const requestId = Crypto.randomUUID();
  let result: Promise<{
    invitationId: string;
    revoked: true;
    replayed: boolean;
  }> | null = null;
  return {
    execute: () => {
      if (result) return result;
      result = (async () => {
        try {
          const client = getSupabaseClient();
          if (!client) throw new InvitationServiceError('configuration');
          const { data, error } = await client.rpc('revoke_client_invitation', {
            p_invitation_id: invitationId,
            p_request_id: requestId,
          });
          if (error) throw rpcError(error.code);
          if (
            !isRecord(data) ||
            data.invitation_id !== invitationId ||
            data.revoked !== true ||
            typeof data.replayed !== 'boolean'
          )
            throw new InvitationServiceError('request');
          return {
            invitationId,
            revoked: true as const,
            replayed: data.replayed,
          };
        } catch (error) {
          result = null;
          if (error instanceof InvitationServiceError) throw error;
          throw new InvitationServiceError('request');
        }
      })();
      return result;
    },
  };
};

export const acceptInvitation = async (
  token: string,
): Promise<InvitationAcceptance> => {
  if (!isInvitationToken(token))
    throw new InvitationServiceError('invalidInput');
  const client = getSupabaseClient();
  if (!client) throw new InvitationServiceError('configuration');
  try {
    const { data, error } = await client.rpc('accept_invitation', {
      p_token: token,
    });
    if (error) throw rpcError(error.code);
    if (
      !isRecord(data) ||
      data.accepted !== true ||
      typeof data.client_record_id !== 'string' ||
      !uuidPattern.test(data.client_record_id) ||
      typeof data.trainer_name !== 'string' ||
      !data.trainer_name.trim() ||
      !validDate(data.accepted_at) ||
      typeof data.replayed !== 'boolean'
    )
      throw new InvitationServiceError('request');
    return {
      clientRecordId: data.client_record_id,
      trainerName: data.trainer_name,
      acceptedAt: data.accepted_at,
      replayed: data.replayed,
    };
  } catch (error) {
    if (error instanceof InvitationServiceError) throw error;
    throw new InvitationServiceError('request');
  }
};

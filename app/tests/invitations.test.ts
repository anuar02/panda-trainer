import type { SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import type { Database } from '../src/lib/database.types';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  acceptInvitation,
  buildInvitationLink,
  createIssueClientInvitationOperation,
  createRevokeClientInvitationOperation,
  InvitationServiceError,
  isInvitationToken,
} from '../src/features/invitations/service';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (count: number) =>
    Uint8Array.from({ length: count }, (_, index) => index),
  ),
  randomUUID: jest.fn(),
}));

const getClient = jest.mocked(getSupabaseClient);
const randomUUID = jest.mocked(Crypto.randomUUID);
const invitationId = '10000000-0000-4000-8000-000000000001';
const clientRecordId = '20000000-0000-4000-8000-000000000001';
const token = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const issuedResult = {
  invitation_id: invitationId,
  expires_at: '2026-10-08T12:00:00.000Z',
  active: true,
  replayed: false,
};

const createMockClient = (rpc: jest.Mock) =>
  ({ rpc }) as unknown as SupabaseClient<Database>;

describe('invitation service', () => {
  beforeEach(() => {
    getClient.mockReset();
    randomUUID.mockReset().mockReturnValue(invitationId);
  });

  it('generates a canonical 256-bit base64url token without a browser encoder', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: issuedResult, error: null });
    getClient.mockReturnValue(createMockClient(rpc));
    const operation = await createIssueClientInvitationOperation(
      clientRecordId,
      'https://invite.example.test',
    );

    const invitation = await operation.execute();

    expect(isInvitationToken(token)).toBe(true);
    expect(invitation.link).toBe(`https://invite.example.test/invite/${token}`);
    expect(rpc).toHaveBeenCalledWith('issue_client_invitation', {
      p_client_record_id: clientRecordId,
      p_token: token,
      p_request_id: invitationId,
    });
  });

  it('retains the same secret and request UUID when the issue call is retried', async () => {
    const rpc = jest
      .fn()
      .mockRejectedValueOnce({ code: 'network', message: `failed ${token}` })
      .mockResolvedValueOnce({ data: issuedResult, error: null });
    getClient.mockReturnValue(createMockClient(rpc));
    const operation = await createIssueClientInvitationOperation(
      clientRecordId,
      'http://localhost:8087',
    );

    await expect(operation.execute()).rejects.toMatchObject({
      code: 'request',
    });
    const invitation = await operation.execute();

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(invitation.link).toContain(token);
  });

  it('coalesces concurrent issue attempts for the same operation', async () => {
    let finish!: (value: { data: typeof issuedResult; error: null }) => void;
    const rpc = jest.fn(
      () =>
        new Promise<{ data: typeof issuedResult; error: null }>((resolve) => {
          finish = resolve;
        }),
    );
    getClient.mockReturnValue(createMockClient(rpc));
    const operation = await createIssueClientInvitationOperation(
      clientRecordId,
      'http://127.0.0.1:8087',
    );

    const first = operation.execute();
    const second = operation.execute();
    finish({ data: issuedResult, error: null });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('rejects unsafe origins, malformed identifiers, and noncanonical tokens', async () => {
    expect(() => buildInvitationLink(token, '')).toThrow(
      expect.objectContaining({ code: 'configuration' }),
    );
    expect(() =>
      buildInvitationLink(token, 'http://coach.example.test'),
    ).toThrow(expect.objectContaining({ code: 'configuration' }));
    expect(() =>
      buildInvitationLink(token, 'https://invite.example.test/path'),
    ).toThrow(expect.objectContaining({ code: 'configuration' }));
    expect(() =>
      buildInvitationLink(token, 'https://user:pass@example.test'),
    ).toThrow(expect.objectContaining({ code: 'configuration' }));
    expect(() =>
      buildInvitationLink(
        `${token.slice(0, -1)}B`,
        'https://invite.example.test',
      ),
    ).toThrow(expect.objectContaining({ code: 'invalidInput' }));
    await expect(
      createIssueClientInvitationOperation(
        'bad-id',
        'https://invite.example.test',
      ),
    ).rejects.toMatchObject({ code: 'invalidInput' });
  });

  it('keeps RPC errors generic and does not echo the bearer token', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { code: 'P0002', message: `private detail ${token}` },
    });
    getClient.mockReturnValue(createMockClient(rpc));

    let caught: unknown;
    try {
      await acceptInvitation(token);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvitationServiceError);
    expect(caught).toMatchObject({ code: 'unavailable' });
    expect((caught as Error).message).not.toContain(token);
  });

  it('keeps a pending invitation retryable after transient RPC failures', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '08006', message: `transient ${token}` },
    });
    getClient.mockReturnValue(createMockClient(rpc));

    await expect(acceptInvitation(token)).rejects.toMatchObject({
      code: 'request',
      message: 'Invitation request could not be completed',
    });
  });

  it('validates the accepted-card response and preserves multiple-card IDs', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        accepted: true,
        replayed: true,
        client_record_id: clientRecordId,
        trainer_name: 'Тренер А',
        accepted_at: '2026-10-01T12:00:00.000Z',
      },
      error: null,
    });
    getClient.mockReturnValue(createMockClient(rpc));

    await expect(acceptInvitation(token)).resolves.toEqual({
      clientRecordId,
      trainerName: 'Тренер А',
      acceptedAt: '2026-10-01T12:00:00.000Z',
      replayed: true,
    });
    expect(rpc).toHaveBeenCalledWith('accept_invitation', {
      p_token: token,
    });
  });

  it('creates a stable revoke operation with one request UUID', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { invitation_id: invitationId, revoked: true, replayed: false },
      error: null,
    });
    getClient.mockReturnValue(createMockClient(rpc));
    const operation = createRevokeClientInvitationOperation(invitationId);

    await expect(operation.execute()).resolves.toEqual({
      invitationId,
      revoked: true,
      replayed: false,
    });
    expect(rpc).toHaveBeenCalledWith('revoke_client_invitation', {
      p_invitation_id: invitationId,
      p_request_id: invitationId,
    });
  });
});

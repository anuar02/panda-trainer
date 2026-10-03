import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '@/features/auth/client';
import {
  createAssignClientProgramOperation,
  WorkspaceProgramAssignmentError,
} from '@/features/workspace-programs/service';
import {
  clearPendingClientProgramAssignment,
  loadPendingClientProgramAssignment,
  PendingClientProgramAssignmentError,
  savePendingClientProgramAssignment,
  type PendingClientProgramAssignment,
} from '@/features/workspace-programs/pending';
import type { Database } from '@/lib/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) =>
        Promise.resolve(values.get(key) ?? null),
      ),
      setItem: jest.fn((key: string, value: string) => {
        values.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        values.delete(key);
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        values.clear();
        return Promise.resolve();
      }),
    },
  };
});

const getClient = jest.mocked(getSupabaseClient);
const randomUUID = jest.mocked(Crypto.randomUUID);
const userId = '51000000-0000-4000-8000-000000000001';
const otherUserId = '51000000-0000-4000-8000-000000000002';
const workspaceId = '61000000-0000-4000-8000-000000000001';
const clientRecordId = '71000000-0000-4000-8000-000000000001';
const templateId = '81000000-0000-4000-8000-000000000001';
const programId = '91000000-0000-4000-8000-000000000001';
const requestId = 'a1000000-0000-4000-8000-000000000001';
const accessToken = 'private-session-token';

const client = (parts: object, sessionUserId = userId) =>
  ({
    ...parts,
    auth: {
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: sessionUserId },
            access_token: accessToken,
          },
        },
        error: null,
      }),
    },
  }) as unknown as SupabaseClient<Database>;

const postgrestResponse = (response: {
  data: unknown;
  error: { code: string } | null;
}) => {
  let builder: Promise<typeof response> & { setHeader: jest.Mock };
  builder = Object.assign(Promise.resolve(response), {
    setHeader: jest.fn().mockImplementation(() => builder),
  });
  return builder;
};

const pending: PendingClientProgramAssignment = {
  clientRecordId,
  templateId,
  expectedTemplateRevision: 4,
  requestId,
};

describe('workspace client program assignment transport', () => {
  beforeEach(async () => {
    getClient.mockReset();
    randomUUID.mockReset().mockReturnValue(requestId);
    jest.mocked(AsyncStorage.clear).mockClear();
    await AsyncStorage.clear();
  });

  it('retries an assignment with one request UUID and binds the expected session', async () => {
    const rpc = jest
      .fn()
      .mockReturnValueOnce(
        postgrestResponse({ data: null, error: { code: '08006' } }),
      )
      .mockReturnValueOnce(
        postgrestResponse({
          data: { id: programId, revision: 1, replayed: true },
          error: null,
        }),
      );
    getClient.mockReturnValue(client({ rpc }));
    const operation = createAssignClientProgramOperation({
      clientRecordId,
      templateId,
      expectedTemplateRevision: 4,
      expectedUserId: userId,
    });

    await expect(operation.execute()).rejects.toMatchObject({
      code: 'request',
    });
    await expect(operation.execute()).resolves.toEqual({
      id: programId,
      revision: 1,
      replayed: true,
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc.mock.calls[0]).toEqual([
      'assign_client_program',
      {
        p_client_record_id: clientRecordId,
        p_template_id: templateId,
        p_expected_template_revision: 4,
        p_request_id: requestId,
      },
    ]);
    expect(rpc.mock.results[0]?.value.setHeader).toHaveBeenCalledWith(
      'Authorization',
      `Bearer ${accessToken}`,
    );
  });

  it('restores an assignment retry using the persisted request ID', async () => {
    const rpc = jest
      .fn()
      .mockReturnValueOnce(
        postgrestResponse({ data: null, error: { code: '08006' } }),
      )
      .mockReturnValueOnce(
        postgrestResponse({
          data: { id: programId, revision: 1, replayed: true },
          error: null,
        }),
      );
    getClient.mockReturnValue(client({ rpc }));
    const first = createAssignClientProgramOperation({
      ...pending,
      expectedUserId: userId,
    });
    await expect(first.execute()).rejects.toBeInstanceOf(
      WorkspaceProgramAssignmentError,
    );
    await savePendingClientProgramAssignment(userId, workspaceId, pending);
    const restored = await loadPendingClientProgramAssignment(
      userId,
      workspaceId,
      clientRecordId,
    );
    expect(restored).toEqual(pending);
    if (!restored) throw new Error('Pending assignment was not restored');
    const retry = createAssignClientProgramOperation({
      ...restored,
      expectedUserId: userId,
    });

    await expect(retry.execute()).resolves.toMatchObject({
      id: programId,
      replayed: true,
    });
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });

  it('does not send an assignment after the session switches users', async () => {
    const rpc = jest.fn();
    getClient.mockReturnValue(client({ rpc }, otherUserId));
    const operation = createAssignClientProgramOperation({
      clientRecordId,
      templateId,
      expectedTemplateRevision: 4,
      expectedUserId: userId,
    });

    await expect(operation.execute()).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('snapshots the expected user before a caller can mutate the input', async () => {
    const rpc = jest.fn().mockReturnValue(
      postgrestResponse({
        data: { id: programId, revision: 1, replayed: false },
        error: null,
      }),
    );
    getClient.mockReturnValue(client({ rpc }));
    const input = {
      clientRecordId,
      templateId,
      expectedTemplateRevision: 4,
      expectedUserId: userId,
    };
    const operation = createAssignClientProgramOperation(input);
    input.expectedUserId = otherUserId;

    await expect(operation.execute()).resolves.toEqual({
      id: programId,
      revision: 1,
      replayed: false,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('maps stale template and malformed RPC results to safe errors', async () => {
    const staleRpc = jest
      .fn()
      .mockReturnValue(
        postgrestResponse({ data: null, error: { code: '40001' } }),
      );
    getClient.mockReturnValue(client({ rpc: staleRpc }));
    const stale = createAssignClientProgramOperation({
      clientRecordId,
      templateId,
      expectedTemplateRevision: 4,
      expectedUserId: userId,
    });
    await expect(stale.execute()).rejects.toMatchObject({ code: 'conflict' });

    const unavailableRpc = jest
      .fn()
      .mockReturnValue(
        postgrestResponse({ data: null, error: { code: 'P0002' } }),
      );
    getClient.mockReturnValue(client({ rpc: unavailableRpc }));
    const unavailable = createAssignClientProgramOperation({
      clientRecordId,
      templateId,
      expectedTemplateRevision: 4,
      expectedUserId: userId,
    });
    await expect(unavailable.execute()).rejects.toMatchObject({
      code: 'notFound',
    });

    const malformedRpc = jest
      .fn()
      .mockReturnValue(
        postgrestResponse({ data: { id: programId }, error: null }),
      );
    getClient.mockReturnValue(client({ rpc: malformedRpc }));
    const malformed = createAssignClientProgramOperation({
      clientRecordId,
      templateId,
      expectedTemplateRevision: 4,
      expectedUserId: userId,
    });
    await expect(malformed.execute()).rejects.toMatchObject({
      code: 'request',
    });
  });

  it('validates assignment IDs and template revisions before networking', () => {
    expect(() =>
      createAssignClientProgramOperation({
        clientRecordId,
        templateId,
        expectedTemplateRevision: 0,
        expectedUserId: userId,
      }),
    ).toThrow(expect.objectContaining({ code: 'invalidInput' }));
    expect(() =>
      createAssignClientProgramOperation({
        clientRecordId,
        templateId,
        expectedTemplateRevision: 4,
        expectedUserId: userId,
        requestId: 'bad-id',
      }),
    ).toThrow(expect.objectContaining({ code: 'invalidInput' }));
  });
});

describe('pending client program assignment storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.mocked(AsyncStorage.getItem).mockClear();
    jest.mocked(AsyncStorage.setItem).mockClear();
    jest.mocked(AsyncStorage.removeItem).mockClear();
  });

  it('stores a validated input snapshot under user/workspace/client keys', async () => {
    const mutable = { ...pending };
    const saving = savePendingClientProgramAssignment(
      userId,
      workspaceId,
      mutable,
    );
    mutable.templateId = programId;
    await saving;

    expect(
      await loadPendingClientProgramAssignment(
        userId,
        workspaceId,
        clientRecordId,
      ),
    ).toEqual(pending);
    expect(
      await loadPendingClientProgramAssignment(
        otherUserId,
        workspaceId,
        clientRecordId,
      ),
    ).toBeNull();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      `panda-trainer-pending-program-v1:${userId}:${workspaceId}:${clientRecordId}`,
      JSON.stringify(pending),
    );
    expect(jest.mocked(AsyncStorage.setItem).mock.calls[0]?.[1]).not.toContain(
      accessToken,
    );
  });

  it('clears only a pending assignment with the matching request ID', async () => {
    await savePendingClientProgramAssignment(userId, workspaceId, pending);
    expect(
      await clearPendingClientProgramAssignment(
        userId,
        workspaceId,
        clientRecordId,
        'a1000000-0000-4000-8000-000000000002',
      ),
    ).toBe(false);
    expect(
      await loadPendingClientProgramAssignment(
        userId,
        workspaceId,
        clientRecordId,
      ),
    ).toEqual(pending);
    expect(
      await clearPendingClientProgramAssignment(
        userId,
        workspaceId,
        clientRecordId,
        requestId,
      ),
    ).toBe(true);
    expect(
      await loadPendingClientProgramAssignment(
        userId,
        workspaceId,
        clientRecordId,
      ),
    ).toBeNull();
  });

  it('preserves and rejects corrupt pending commands instead of risking a duplicate', async () => {
    const corruptKey = `panda-trainer-pending-program-v1:${userId}:${workspaceId}:${clientRecordId}`;
    const corrupt = JSON.stringify({ ...pending, accessToken });
    await AsyncStorage.setItem(corruptKey, corrupt);

    await expect(
      loadPendingClientProgramAssignment(userId, workspaceId, clientRecordId),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(await AsyncStorage.getItem(corruptKey)).toBe(corrupt);

    await expect(
      savePendingClientProgramAssignment(userId, workspaceId, pending),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(await AsyncStorage.getItem(corruptKey)).toBe(corrupt);
  });

  it('allows the same pending request retry but refuses to overwrite another command', async () => {
    await savePendingClientProgramAssignment(userId, workspaceId, pending);
    const writesAfterFirstSave = jest.mocked(AsyncStorage.setItem).mock.calls
      .length;
    await savePendingClientProgramAssignment(userId, workspaceId, pending);
    expect(jest.mocked(AsyncStorage.setItem).mock.calls).toHaveLength(
      writesAfterFirstSave,
    );

    const otherPending = {
      ...pending,
      templateId: programId,
      requestId: 'a1000000-0000-4000-8000-000000000002',
    };
    await expect(
      savePendingClientProgramAssignment(userId, workspaceId, otherPending),
    ).rejects.toMatchObject({ code: 'unresolved' });
    await expect(
      loadPendingClientProgramAssignment(userId, workspaceId, clientRecordId),
    ).resolves.toEqual(pending);
  });

  it('preserves a record whose stored client ID does not match its key', async () => {
    const corruptKey = `panda-trainer-pending-program-v1:${userId}:${workspaceId}:${clientRecordId}`;
    const corrupt = JSON.stringify({ ...pending, clientRecordId: templateId });
    await AsyncStorage.setItem(corruptKey, corrupt);

    await expect(
      loadPendingClientProgramAssignment(userId, workspaceId, clientRecordId),
    ).rejects.toBeInstanceOf(PendingClientProgramAssignmentError);
    expect(await AsyncStorage.getItem(corruptKey)).toBe(corrupt);
  });

  it('rejects invalid pending input without entering storage', async () => {
    expect(() =>
      savePendingClientProgramAssignment(userId, workspaceId, {
        ...pending,
        expectedTemplateRevision: 0,
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid' }));
  });
  it('preserves a pending command if its session expires during conditional clear', async () => {
    await savePendingClientProgramAssignment(userId, workspaceId, pending);
    let active = true;
    const originalGet = jest
      .mocked(AsyncStorage.getItem)
      .getMockImplementation();
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(async (key) => {
      const raw = await originalGet?.(key);
      active = false;
      return raw ?? null;
    });
    await expect(
      clearPendingClientProgramAssignment(
        userId,
        workspaceId,
        clientRecordId,
        requestId,
        () => active,
      ),
    ).resolves.toBe(false);
    await expect(
      loadPendingClientProgramAssignment(userId, workspaceId, clientRecordId),
    ).resolves.toEqual(pending);
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('retains the exact command after a failed remove and permits the same retry', async () => {
    await savePendingClientProgramAssignment(userId, workspaceId, pending);
    jest
      .mocked(AsyncStorage.removeItem)
      .mockRejectedValueOnce(new Error('synthetic storage failure'));
    await expect(
      clearPendingClientProgramAssignment(
        userId,
        workspaceId,
        clientRecordId,
        requestId,
      ),
    ).rejects.toMatchObject({ code: 'storage' });
    await expect(
      loadPendingClientProgramAssignment(userId, workspaceId, clientRecordId),
    ).resolves.toEqual(pending);
    await expect(
      savePendingClientProgramAssignment(userId, workspaceId, pending),
    ).resolves.toBeUndefined();
    await expect(
      clearPendingClientProgramAssignment(
        userId,
        workspaceId,
        clientRecordId,
        requestId,
      ),
    ).resolves.toBe(true);
  });

  it('serializes a delayed clear before a newer save and protects that newer request', async () => {
    await savePendingClientProgramAssignment(userId, workspaceId, pending);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalGet = jest
      .mocked(AsyncStorage.getItem)
      .getMockImplementation();
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(async (key) => {
      await gate;
      return (await originalGet?.(key)) ?? null;
    });
    const clearing = clearPendingClientProgramAssignment(
      userId,
      workspaceId,
      clientRecordId,
      requestId,
    );
    const newer = {
      ...pending,
      requestId: 'a1000000-0000-4000-8000-000000000002',
    };
    const saving = savePendingClientProgramAssignment(
      userId,
      workspaceId,
      newer,
    );
    release();
    await clearing;
    await saving;
    await expect(
      clearPendingClientProgramAssignment(
        userId,
        workspaceId,
        clientRecordId,
        requestId,
      ),
    ).resolves.toBe(false);
    await expect(
      loadPendingClientProgramAssignment(userId, workspaceId, clientRecordId),
    ).resolves.toEqual(newer);
  });
});

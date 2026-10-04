import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  submitWorkspaceBooking,
  resumeWorkspaceBooking,
} from '../src/features/workspace-scheduling/creation';
import {
  clearPendingWorkspaceBooking,
  loadPendingWorkspaceBooking,
  savePendingWorkspaceBooking,
  type PendingWorkspaceBooking,
} from '../src/features/workspace-scheduling/pending';
import { bookingAuthFixture } from './booking-creation-auth-fixture';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        values.delete(key);
      }),
      clear: jest.fn(async () => {
        values.clear();
      }),
    },
  };
});
const userId = '51000000-0000-4000-8000-000000000001';
const workspaceId = '61000000-0000-4000-8000-000000000001';
const otherId = '61000000-0000-4000-8000-000000000002';
const command: PendingWorkspaceBooking = {
  clientRecordIds: ['71000000-0000-4000-8000-000000000001'],
  requestId: 'a1000000-0000-4000-8000-000000000001',
  startsAtUtc: '2026-10-05T10:00:00.000Z',
  endsAtUtc: '2026-10-05T11:00:00.000Z',
  collisionAcknowledged: false,
  plan: { templateId: otherId, expectedTemplateRevision: 3 },
};
const receipt = {
  created: true,
  booking_ids: ['81000000-0000-4000-8000-000000000001'],
  group_session_id: null,
  overlaps: [],
  replayed: false,
};
let auth: ReturnType<typeof bookingAuthFixture>;
let response: () => Promise<{ data: unknown; error: null }>;
const rpc = jest.fn();
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  auth = bookingAuthFixture(userId);
  response = async () => ({ data: receipt, error: null });
  rpc.mockReset().mockImplementation(() => ({ setHeader: () => response() }));
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue({ ...auth.client, rpc } as unknown as ReturnType<
      typeof getSupabaseClient
    >);
});
const relogin = () => auth.change(auth.session(userId, otherId), 'SIGNED_IN');

test('same-user relogin after save preserves durable command and never sends', async () => {
  const write = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
  jest
    .mocked(AsyncStorage.setItem)
    .mockImplementationOnce(async (key, value) => {
      await write(key, value);
      relogin();
    });
  await expect(
    submitWorkspaceBooking(userId, workspaceId, command),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(rpc).not.toHaveBeenCalled();
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    command,
  );
  expect(auth.listenerCount).toBe(0);
  await expect(
    resumeWorkspaceBooking(userId, workspaceId),
  ).resolves.toMatchObject({ created: true });
  expect(rpc).toHaveBeenCalledWith(
    'create_booking_set_with_plan',
    expect.objectContaining({
      p_request_id: command.requestId,
      p_expected_template_revision: 3,
    }),
  );
});

test.each(['logout', 'relogin', 'actor', 'scope'] as const)(
  'late success under %s keeps pending and cannot clear',
  async (change) => {
    let current = true;
    response = async () => {
      if (change === 'logout') auth.change(null, 'SIGNED_OUT');
      if (change === 'relogin') relogin();
      if (change === 'actor') auth.change(auth.session(otherId));
      if (change === 'scope') current = false;
      return { data: receipt, error: null };
    };
    await expect(
      submitWorkspaceBooking(userId, workspaceId, command, () => current),
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
      command,
    );
    expect(await loadPendingWorkspaceBooking(userId, otherId)).toBeNull();
    expect(auth.listenerCount).toBe(0);
  },
);

test('resume pins login before pending load and rejects late hydration', async () => {
  await savePendingWorkspaceBooking(userId, workspaceId, command);
  const read = jest.mocked(AsyncStorage.getItem).getMockImplementation()!;
  jest.mocked(AsyncStorage.getItem).mockImplementationOnce(async (key) => {
    const raw = await read(key);
    relogin();
    return raw;
  });
  await expect(
    resumeWorkspaceBooking(userId, workspaceId),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(rpc).not.toHaveBeenCalled();
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    command,
  );
});

test('clear checks session again after its queued storage read', async () => {
  const read = jest.mocked(AsyncStorage.getItem).getMockImplementation()!;
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementationOnce(read)
    .mockImplementationOnce(async (key) => {
      const raw = await read(key);
      relogin();
      return raw;
    });
  await expect(
    submitWorkspaceBooking(userId, workspaceId, command),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    command,
  );
});

test('uncertain success and clear failure replay the exact request and plan on reopen', async () => {
  response = async () => {
    throw new Error('response lost');
  };
  await expect(
    submitWorkspaceBooking(userId, workspaceId, command),
  ).rejects.toMatchObject({ code: 'request' });
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    command,
  );
  response = async () => ({
    data: { ...receipt, replayed: true },
    error: null,
  });
  jest
    .mocked(AsyncStorage.removeItem)
    .mockRejectedValueOnce(new Error('disk failure'));
  await expect(
    resumeWorkspaceBooking(userId, workspaceId),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    command,
  );
  await expect(
    resumeWorkspaceBooking(userId, workspaceId),
  ).resolves.toMatchObject({ replayed: true });
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toBeNull();
  for (const call of rpc.mock.calls)
    expect(call).toEqual([
      'create_booking_set_with_plan',
      expect.objectContaining({
        p_request_id: command.requestId,
        p_template_id: otherId,
        p_expected_template_revision: 3,
      }),
    ]);
});

test('conditional completion leaves a newer pending command intact', async () => {
  const newer = { ...command, requestId: otherId };
  response = async () => {
    await clearPendingWorkspaceBooking(userId, workspaceId, command.requestId);
    await savePendingWorkspaceBooking(userId, workspaceId, newer);
    return { data: receipt, error: null };
  };
  await submitWorkspaceBooking(userId, workspaceId, command);
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(newer);
});

test('overlap releases command and explicit acknowledgement creates with the same plan', async () => {
  response = async () => ({
    data: {
      ...receipt,
      created: false,
      booking_ids: [],
      requires_overlap_ack: true,
      overlaps: [
        {
          booking_ids: receipt.booking_ids,
          starts_at: command.startsAtUtc,
          ends_at: command.endsAtUtc,
        },
      ],
    },
    error: null,
  });
  await expect(
    submitWorkspaceBooking(userId, workspaceId, command),
  ).resolves.toMatchObject({
    created: false,
    requiresOverlapAcknowledgement: true,
  });
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toBeNull();
  response = async () => ({ data: receipt, error: null });
  await expect(
    submitWorkspaceBooking(userId, workspaceId, {
      ...command,
      requestId: otherId,
      collisionAcknowledged: true,
    }),
  ).resolves.toMatchObject({ created: true });
  expect(rpc).toHaveBeenLastCalledWith(
    'create_booking_set_with_plan',
    expect.objectContaining({
      p_collision_ack: true,
      p_template_id: otherId,
      p_expected_template_revision: 3,
    }),
  );
});

test('relogin during removal restores pending before allowing another queued command', async () => {
  const remove = jest.mocked(AsyncStorage.removeItem).getMockImplementation()!;
  jest.mocked(AsyncStorage.removeItem).mockImplementationOnce(async (key) => {
    await remove(key);
    relogin();
  });
  await expect(
    submitWorkspaceBooking(userId, workspaceId, command),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    command,
  );
  await expect(
    resumeWorkspaceBooking(userId, workspaceId),
  ).resolves.toMatchObject({ created: true });
});

test('refresh during storage and RPC retains one login fence', async () => {
  const write = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
  jest
    .mocked(AsyncStorage.setItem)
    .mockImplementationOnce(async (key, value) => {
      await write(key, value);
      auth.change(
        auth.session(userId, auth.sessionId, 'refresh-save'),
        'TOKEN_REFRESHED',
      );
    });
  response = async () => {
    auth.change(
      auth.session(userId, auth.sessionId, 'refresh-rpc'),
      'TOKEN_REFRESHED',
    );
    return { data: receipt, error: null };
  };
  await expect(
    submitWorkspaceBooking(userId, workspaceId, command),
  ).resolves.toMatchObject({ created: true });
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toBeNull();
  expect(auth.listenerCount).toBe(0);
});

test('login changed during final auth check restores the cleared command', async () => {
  const check = auth.auth.getSession.getMockImplementation()!;
  for (let index = 0; index < 5; index += 1)
    auth.auth.getSession.mockImplementationOnce(check);
  auth.auth.getSession.mockImplementationOnce(async () => {
    relogin();
    return check();
  });
  await expect(
    submitWorkspaceBooking(userId, workspaceId, command),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    command,
  );
});

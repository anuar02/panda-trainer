import { schedulingAuthFixture } from './scheduling-command-auth-fixture';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '../src/features/auth/client';
import { createWorkspaceBookingStatusOperation } from '../src/features/workspace-scheduling/status-operation';
import { createWorkspaceProposalOperation } from '../src/features/workspace-scheduling/proposal-operation';
import {
  submitWorkspaceBookingStatus,
  resumeWorkspaceBookingStatus,
  resolvePendingWorkspaceBookingStatus,
} from '../src/features/workspace-scheduling/status-submission';
import {
  submitWorkspaceProposal,
  resumeWorkspaceProposal,
  resolvePendingWorkspaceProposal,
} from '../src/features/workspace-scheduling/proposal-submission';
import {
  loadPendingWorkspaceBookingStatus,
  savePendingWorkspaceBookingStatus,
  clearPendingWorkspaceBookingStatus,
} from '../src/features/workspace-scheduling/status-pending';
import {
  loadPendingWorkspaceProposal,
  savePendingWorkspaceProposal,
  clearPendingWorkspaceProposal,
} from '../src/features/workspace-scheduling/proposal-pending';

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
const user = '51000000-0000-4000-8000-000000000001';
const workspace = '61000000-0000-4000-8000-000000000001';
const booking = '81000000-0000-4000-8000-000000000001';
const proposal = '91000000-0000-4000-8000-000000000001';
const request = 'a1000000-0000-4000-8000-000000000001';
const other = 'a1000000-0000-4000-8000-000000000002';
const status = {
  action: 'cancel' as const,
  bookingId: booking,
  expectedRevision: 3,
  requestId: request,
};
const reschedule = {
  action: 'accept' as const,
  bookingId: booking,
  proposalId: proposal,
  expectedBookingRevision: 3,
  expectedProposalRevision: 2,
  requestId: request,
};
const statusReceipt = {
  booking_id: booking,
  revision: 4,
  status: 'cancelled_by_client',
  replayed: false,
};
const proposalReceipt = {
  booking_id: booking,
  booking_revision: 4,
  booking_status: 'confirmed',
  proposal_id: proposal,
  proposal_revision: 3,
  proposal_status: 'accepted',
  starts_at: '2030-10-06T10:00:00Z',
  ends_at: '2030-10-06T11:00:00Z',
  replayed: false,
};
let auth: ReturnType<typeof schedulingAuthFixture>;
let header: jest.Mock;
let rpc: jest.Mock;
const relogin = () => auth.change(auth.session(user, other), 'SIGNED_IN');
const families = [
  {
    name: 'status',
    command: status,
    receipt: statusReceipt,
    submit: (active?: () => boolean) =>
      submitWorkspaceBookingStatus(user, workspace, status, active),
    resume: () => resumeWorkspaceBookingStatus(user, workspace),
    resolve: () => resolvePendingWorkspaceBookingStatus(user, workspace),
    load: () => loadPendingWorkspaceBookingStatus(user, workspace),
    save: () => savePendingWorkspaceBookingStatus(user, workspace, status),
    newer: () =>
      savePendingWorkspaceBookingStatus(user, workspace, {
        ...status,
        requestId: other,
      }),
    clear: () => clearPendingWorkspaceBookingStatus(user, workspace, request),
    operation: () =>
      createWorkspaceBookingStatusOperation({
        ...status,
        expectedUserId: user,
      }),
    envelope: (outcome = 'succeeded') => ({
      command_family: 'status',
      workspace_id: workspace,
      booking_id: booking,
      request_id: request,
      canonical_payload: {
        command: 'cancel',
        booking_id: booking,
        expected_revision: 3,
      },
      outcome,
      result:
        outcome === 'succeeded' ? { ...statusReceipt, replayed: true } : null,
    }),
  },
  {
    name: 'proposal',
    command: reschedule,
    receipt: proposalReceipt,
    submit: (active?: () => boolean) =>
      submitWorkspaceProposal(user, workspace, reschedule, active),
    resume: () => resumeWorkspaceProposal(user, workspace),
    resolve: () => resolvePendingWorkspaceProposal(user, workspace),
    load: () => loadPendingWorkspaceProposal(user, workspace),
    save: () => savePendingWorkspaceProposal(user, workspace, reschedule),
    newer: () =>
      savePendingWorkspaceProposal(user, workspace, {
        ...reschedule,
        requestId: other,
      }),
    clear: () => clearPendingWorkspaceProposal(user, workspace, request),
    operation: () => createWorkspaceProposalOperation(reschedule, user),
    envelope: (outcome = 'succeeded') => ({
      command_family: 'reschedule',
      workspace_id: workspace,
      booking_id: booking,
      request_id: request,
      canonical_payload: {
        command: 'accept',
        booking_id: null,
        proposal_id: proposal,
        expected_booking_revision: 3,
        expected_proposal_revision: 2,
        proposed_starts_epoch: null,
      },
      outcome,
      result:
        outcome === 'succeeded' ? { ...proposalReceipt, replayed: true } : null,
    }),
  },
];
const storageRead = jest.mocked(AsyncStorage.getItem).getMockImplementation()!;
const storageWrite = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
const storageRemove = jest
  .mocked(AsyncStorage.removeItem)
  .getMockImplementation()!;
beforeEach(async () => {
  jest.mocked(AsyncStorage.getItem).mockImplementation(storageRead);
  jest.mocked(AsyncStorage.setItem).mockImplementation(storageWrite);
  jest.mocked(AsyncStorage.removeItem).mockImplementation(storageRemove);
  jest.clearAllMocks();
  await AsyncStorage.clear();
  auth = schedulingAuthFixture(user, workspace);
  header = jest.fn();
  rpc = jest.fn(() => ({ setHeader: header }));
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue({ ...auth.client, rpc } as unknown as ReturnType<
      typeof getSupabaseClient
    >);
});
describe.each(families)('$name durable session fencing', (family) => {
  beforeEach(() =>
    header.mockResolvedValue({ data: family.receipt, error: null }),
  );
  test.each(['save', 'rpc', 'clear-read', 'clear-remove'])(
    'same-user relogin at %s fails closed and preserves exact replay',
    async (stage) => {
      if (stage === 'save') {
        const write = jest
          .mocked(AsyncStorage.setItem)
          .getMockImplementation()!;
        jest
          .mocked(AsyncStorage.setItem)
          .mockImplementationOnce(async (key, value) => {
            await write(key, value);
            relogin();
          });
      } else if (stage === 'rpc')
        header.mockImplementationOnce(async () => {
          relogin();
          return { data: family.receipt, error: null };
        });
      else if (stage === 'clear-read') {
        const read = jest.mocked(AsyncStorage.getItem).getMockImplementation()!;
        jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => {
          const value = await read(key);
          if (value !== null) relogin();
          return value;
        });
      } else {
        const remove = jest
          .mocked(AsyncStorage.removeItem)
          .getMockImplementation()!;
        jest
          .mocked(AsyncStorage.removeItem)
          .mockImplementationOnce(async (key) => {
            await remove(key);
            relogin();
          });
      }
      await expect(family.submit()).rejects.toMatchObject({
        code: 'unavailable',
      });
      if (stage === 'clear-read')
        jest.mocked(AsyncStorage.getItem).mockImplementation(storageRead);
      expect(await family.load()).toEqual(family.command);
      if (stage === 'save') expect(rpc).not.toHaveBeenCalled();
    },
  );
  test.each(['SIGNED_OUT', 'SIGNED_IN', 'USER_UPDATED'] as const)(
    'late transport error after %s is unavailable',
    async (event) => {
      header.mockImplementationOnce(async () => {
        auth.change(event === 'SIGNED_OUT' ? null : auth.session(), event);
        throw new Error('private transport detail');
      });
      await expect(family.submit()).rejects.toMatchObject({
        code: 'unavailable',
      });
      expect(await family.load()).toEqual(family.command);
    },
  );
  test('scope change or unmount while RPC settles cannot clear storage', async () => {
    let active = true;
    header.mockImplementationOnce(async () => {
      active = false;
      return { data: family.receipt, error: null };
    });
    await expect(family.submit(() => active)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(await family.load()).toEqual(family.command);
  });
  test('verified refresh keeps exact bearer and permits later verified retry', async () => {
    header.mockImplementationOnce(async () => {
      auth.change(
        auth.session(user, auth.sessionId, 'refreshed'),
        'TOKEN_REFRESHED',
      );
      return { data: family.receipt, error: null };
    });
    await family.submit();
    expect(header).toHaveBeenCalledWith(
      'Authorization',
      `Bearer ${auth.session().access_token}`,
    );
    expect(await family.load()).toBeNull();
    expect(auth.listenerCount).toBe(0);
  });
  test('cached success is guarded after silent session replacement', async () => {
    const operation = family.operation();
    await operation.execute();
    auth.change(auth.session(user, other));
    await expect(operation.execute()).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  test('JWT subject mismatch is rejected before save or network', async () => {
    auth.change({
      user: { id: user },
      access_token: auth.session(other).access_token,
    });
    await expect(family.submit()).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  test('lost response then reopen retries original canonical command exactly', async () => {
    header.mockRejectedValueOnce(new Error('lost response'));
    await expect(family.submit()).rejects.toMatchObject({ code: 'request' });
    expect(await family.load()).toEqual(family.command);
    header.mockResolvedValue({
      data: { ...family.receipt, replayed: true },
      error: null,
    });
    await expect(family.resume()).resolves.toMatchObject({ replayed: true });
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(await family.load()).toBeNull();
  });
  test('clear failure after success preserves command for exact receipt replay', async () => {
    jest
      .mocked(AsyncStorage.removeItem)
      .mockRejectedValueOnce(new Error('disk'));
    await expect(family.submit()).rejects.toMatchObject({ code: 'storage' });
    expect(await family.load()).toEqual(family.command);
    header.mockResolvedValue({
      data: { ...family.receipt, replayed: true },
      error: null,
    });
    await expect(family.resume()).resolves.toMatchObject({ replayed: true });
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
  test('late completion never clears a newer durable command', async () => {
    header.mockImplementationOnce(async () => {
      await family.clear();
      await family.newer();
      return { data: family.receipt, error: null };
    });
    await family.submit();
    expect(await family.load()).toEqual({
      ...family.command,
      requestId: other,
    });
  });
  test.each(['succeeded', 'abandoned'])(
    'resolution clears only validated %s',
    async (outcome) => {
      await family.save();
      header.mockResolvedValue({ data: family.envelope(outcome), error: null });
      expect(await family.resolve()).toMatchObject({ outcome });
      expect(await family.load()).toBeNull();
    },
  );
  test.each(['notFound', 'conflict', 'stale', 'foreign'])(
    'resolution preserves honest %s pending state',
    async (outcome) => {
      await family.save();
      header.mockResolvedValue({ data: family.envelope(outcome), error: null });
      await expect(family.resolve()).rejects.toMatchObject({ code: 'request' });
      expect(await family.load()).toEqual(family.command);
    },
  );
  test('resolution response after relogin preserves pending and hides result', async () => {
    await family.save();
    header.mockImplementationOnce(async () => {
      relogin();
      return { data: family.envelope(), error: null };
    });
    await expect(family.resolve()).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(await family.load()).toEqual(family.command);
  });
});

describe.each(families)('$name target validation', (family) => {
  beforeEach(() =>
    header.mockResolvedValue({ data: family.receipt, error: null }),
  );
  test.each(['workspace', 'booking', 'missing', 'proposal'])(
    'foreign %s is rejected before mutation and remains pending',
    async (kind) => {
      auth.from.mockImplementation((table) => {
        const row =
          table === 'bookings'
            ? {
                id: kind === 'booking' ? other : booking,
                workspace_id: kind === 'workspace' ? other : workspace,
                client_record_id: other,
              }
            : {
                id: proposal,
                workspace_id: workspace,
                booking_id: kind === 'proposal' ? other : booking,
              };
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () => query,
          setHeader: async () => ({
            data: kind === 'missing' ? null : row,
            error: null,
          }),
        };
        return query;
      });
      if (kind === 'proposal' && family.name === 'status') return;
      await expect(family.submit()).rejects.toMatchObject({
        code: 'unavailable',
      });
      expect(rpc).not.toHaveBeenCalled();
      expect(await family.load()).toEqual(family.command);
    },
  );
  test('read exception exposes only safe request error and leaves exact command', async () => {
    auth.from.mockImplementationOnce(() => {
      throw new Error('secret bearer detail');
    });
    await expect(family.submit()).rejects.toMatchObject({
      code: 'request',
      message: expect.not.stringContaining('secret'),
    });
    expect(await family.load()).toEqual(family.command);
  });
  test('read response after relogin cannot reach RPC', async () => {
    const from = auth.from.getMockImplementation()!;
    auth.from.mockImplementationOnce((table) => {
      const query = from(table);
      const header = query.setHeader;
      query.setHeader = async (key, value) => {
        const result = await header(key, value);
        relogin();
        return result;
      };
      return query;
    });
    await expect(family.submit()).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(await family.load()).toEqual(family.command);
  });
  test('failed cleanup that actually removed data reestablishes exact durable replay', async () => {
    jest.mocked(AsyncStorage.removeItem).mockImplementationOnce(async (key) => {
      await storageRemove(key);
      throw new Error('lost storage acknowledgement');
    });
    await expect(family.submit()).rejects.toMatchObject({ code: 'storage' });
    expect(await family.load()).toEqual(family.command);
  });
});
test.each(['status', 'proposal'])(
  'client-scoped %s refuses pending booking of another client',
  async (family) => {
    const operation =
      family === 'status'
        ? submitWorkspaceBookingStatus(
            user,
            workspace,
            status,
            () => true,
            other,
          )
        : submitWorkspaceProposal(
            user,
            workspace,
            reschedule,
            () => true,
            other,
          );
    await expect(operation).rejects.toMatchObject({ code: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
  },
);

describe.each(families)('$name every auth await', (family) => {
  test.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'relogin at auth verification %i fails closed',
    async (boundary) => {
      header.mockResolvedValue({ data: family.receipt, error: null });
      const get = auth.auth.getSession.getMockImplementation()!;
      let count = 0;
      auth.auth.getSession.mockImplementation(async () => {
        const value = await get();
        if (++count === boundary) relogin();
        return value;
      });
      await expect(family.submit()).rejects.toMatchObject({
        code: 'unavailable',
      });
      if (boundary === 1) expect(await family.load()).toBeNull();
      else expect(await family.load()).toEqual(family.command);
    },
  );
});

describe.each(families)(
  '$name recovery under persistent cleanup failure',
  (family) => {
    test('failed restore remains available for exact replay until storage recovers', async () => {
      header.mockResolvedValue({ data: family.receipt, error: null });
      jest
        .mocked(AsyncStorage.removeItem)
        .mockImplementationOnce(async (key) => {
          await storageRemove(key);
          jest
            .mocked(AsyncStorage.setItem)
            .mockRejectedValueOnce(new Error('restore disk failure'));
          throw new Error('remove acknowledgement lost');
        });
      await expect(family.submit()).rejects.toMatchObject({ code: 'storage' });
      expect(await family.load()).toEqual(family.command);
      header.mockResolvedValue({
        data: { ...family.receipt, replayed: true },
        error: null,
      });
      await expect(family.resume()).resolves.toMatchObject({ replayed: true });
      expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
      expect(await family.load()).toBeNull();
    });
    test('relogin during persisted reopen read preserves command and never sends', async () => {
      await family.save();
      jest.mocked(AsyncStorage.getItem).mockImplementationOnce(async (key) => {
        const raw = await storageRead(key);
        relogin();
        return raw;
      });
      await expect(family.resume()).rejects.toMatchObject({
        code: 'unavailable',
      });
      expect(rpc).not.toHaveBeenCalled();
      expect(await family.load()).toEqual(family.command);
    });
    test('clear compares canonical payload as well as request ID', async () => {
      header.mockImplementationOnce(async () => {
        const key = jest.mocked(AsyncStorage.setItem).mock.calls.at(-1)![0];
        const newer =
          family.name === 'status'
            ? { ...status, expectedRevision: 9 }
            : { ...reschedule, expectedBookingRevision: 9 };
        await AsyncStorage.setItem(key, JSON.stringify(newer));
        return { data: family.receipt, error: null };
      });
      await family.submit();
      expect(await family.load()).toMatchObject({
        requestId: request,
        ...(family.name === 'status'
          ? { expectedRevision: 9 }
          : { expectedBookingRevision: 9 }),
      });
    });
  },
);

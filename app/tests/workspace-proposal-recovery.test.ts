import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getSupabaseClient } from '@/features/auth/client';
import {
  loadPendingWorkspaceProposal,
  savePendingWorkspaceProposal,
  clearPendingWorkspaceProposal,
} from '@/features/workspace-scheduling/proposal-pending';
import {
  submitWorkspaceProposal,
  resumeWorkspaceProposal,
} from '@/features/workspace-scheduling/proposal-submission';
import type { WorkspaceProposalCommand } from '@/features/workspace-scheduling/proposal-operation';
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
const user = '51000000-0000-4000-8000-000000000001';
const workspace = '61000000-0000-4000-8000-000000000001';
const booking = '81000000-0000-4000-8000-000000000001';
const proposal = '91000000-0000-4000-8000-000000000001';
const request = 'a1000000-0000-4000-8000-000000000001';
const command = (): WorkspaceProposalCommand => ({
  action: 'accept',
  bookingId: booking,
  expectedBookingRevision: 3,
  requestId: request,
  proposalId: proposal,
  expectedProposalRevision: 2,
});
const result = {
  proposal_id: proposal,
  proposal_revision: 3,
  proposal_status: 'accepted',
  booking_id: booking,
  booking_revision: 4,
  booking_status: 'confirmed',
  starts_at: '2026-10-06T10:00:00Z',
  ends_at: '2026-10-06T11:00:00Z',
  replayed: false,
};
const header = jest.fn();
const rpc = jest.fn().mockImplementation(() => ({ setHeader: header }));
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  header.mockResolvedValue({ data: result, error: null });
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: user }, access_token: 'token' } },
        error: null,
      }),
    },
    rpc,
  } as unknown as SupabaseClient<Database>);
});
test('isolates accounts/workspaces and snapshots before caller mutation', async () => {
  const value = command();
  const save = savePendingWorkspaceProposal(user, workspace, value);
  value.requestId = booking;
  value.expectedBookingRevision = 9;
  await save;
  expect(await loadPendingWorkspaceProposal(user, workspace)).toEqual(
    command(),
  );
  expect(await loadPendingWorkspaceProposal(booking, workspace)).toBeNull();
  expect(await loadPendingWorkspaceProposal(user, booking)).toBeNull();
});
test('serializes racing saves and prevents replacing unresolved payload', async () => {
  const results = await Promise.allSettled([
    savePendingWorkspaceProposal(user, workspace, command()),
    savePendingWorkspaceProposal(user, workspace, {
      ...command(),
      requestId: booking,
    }),
  ]);
  expect(results[0].status).toBe('fulfilled');
  expect(results[1]).toMatchObject({
    status: 'rejected',
    reason: { code: 'unresolved' },
  });
  await savePendingWorkspaceProposal(user, workspace, {
    ...command(),
    requestId: request.toUpperCase(),
  });
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  await expect(
    savePendingWorkspaceProposal(user, workspace, {
      ...command(),
      expectedBookingRevision: 4,
    }),
  ).rejects.toMatchObject({ code: 'unresolved' });
});
test('stale completion cannot remove different command', async () => {
  await savePendingWorkspaceProposal(user, workspace, command());
  expect(await clearPendingWorkspaceProposal(user, workspace, booking)).toBe(
    false,
  );
  expect(await clearPendingWorkspaceProposal(user, workspace, request)).toBe(
    true,
  );
});
test('persists before sending and clears known success', async () => {
  let release = () => {};
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const sent = submitWorkspaceProposal(user, workspace, command());
  await Promise.resolve();
  await Promise.resolve();
  expect(rpc).not.toHaveBeenCalled();
  release();
  await expect(sent).resolves.toMatchObject({ proposalStatus: 'accepted' });
  expect(await loadPendingWorkspaceProposal(user, workspace)).toBeNull();
});
test('storage failure sends nothing and later save recovers', async () => {
  jest
    .mocked(AsyncStorage.setItem)
    .mockRejectedValueOnce(new Error('diskfull'));
  await expect(
    submitWorkspaceProposal(user, workspace, command()),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(rpc).not.toHaveBeenCalled();
  await submitWorkspaceProposal(user, workspace, command());
  expect(rpc).toHaveBeenCalledTimes(1);
});
test('lost response retains exact command and replay after restart clears it', async () => {
  header.mockRejectedValueOnce(new Error('lost'));
  await expect(
    submitWorkspaceProposal(user, workspace, command()),
  ).rejects.toMatchObject({ code: 'request' });
  expect(await loadPendingWorkspaceProposal(user, workspace)).toEqual(
    command(),
  );
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  header.mockResolvedValueOnce({
    data: { ...result, replayed: true },
    error: null,
  });
  await expect(resumeWorkspaceProposal(user, workspace)).resolves.toMatchObject(
    { replayed: true },
  );
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  expect(await loadPendingWorkspaceProposal(user, workspace)).toBeNull();
});
test('cleanup failure keeps receipt available for exact replay', async () => {
  jest
    .mocked(AsyncStorage.removeItem)
    .mockRejectedValueOnce(new Error('diskfailed'));
  await expect(
    submitWorkspaceProposal(user, workspace, command()),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(await loadPendingWorkspaceProposal(user, workspace)).toEqual(
    command(),
  );
  header.mockResolvedValueOnce({
    data: { ...result, replayed: true },
    error: null,
  });
  await expect(resumeWorkspaceProposal(user, workspace)).resolves.toMatchObject(
    { replayed: true },
  );
});
test('stale revision is retained without automatic replacement', async () => {
  header.mockResolvedValueOnce({ data: null, error: { code: '40001' } });
  await expect(
    submitWorkspaceProposal(user, workspace, command()),
  ).rejects.toMatchObject({ code: 'conflict' });
  expect(await loadPendingWorkspaceProposal(user, workspace)).toEqual(
    command(),
  );
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
});
test.each([
  '{',
  JSON.stringify({ ...command(), unknown: true }),
  JSON.stringify({ ...command(), expectedProposalRevision: 0 }),
])('corrupt pending data blocks recovery overwrite/delete %s', async (raw) => {
  jest
    .mocked(AsyncStorage.getItem)
    .mockResolvedValueOnce(raw)
    .mockResolvedValueOnce(raw)
    .mockResolvedValueOnce(raw);
  await expect(resumeWorkspaceProposal(user, workspace)).rejects.toMatchObject({
    code: 'invalid',
  });
  await expect(
    savePendingWorkspaceProposal(user, workspace, command()),
  ).rejects.toMatchObject({ code: 'invalid' });
  await expect(
    clearPendingWorkspaceProposal(user, workspace, request),
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(rpc).not.toHaveBeenCalled();
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
});
test('no pending command means no request', async () => {
  expect(await resumeWorkspaceProposal(user, workspace)).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});

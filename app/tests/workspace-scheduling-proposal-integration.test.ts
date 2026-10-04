import { schedulingAuthFixture } from './scheduling-command-auth-fixture';
import { bookingAuthFixture } from './booking-creation-auth-fixture';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import type { Database } from '@/lib/database.types';
import { loadPendingWorkspaceProposal } from '@/features/workspace-scheduling/proposal-pending';
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
const userId = '51000000-0000-4000-8000-000000000001';
const otherUserId = '51000000-0000-4000-8000-000000000002';
const workspaceId = '61000000-0000-4000-8000-000000000001';
const bookingId = '81000000-0000-4000-8000-000000000001';
const proposalId = '91000000-0000-4000-8000-000000000001';
const command: WorkspaceProposalCommand = {
  action: 'withdraw',
  bookingId,
  expectedBookingRevision: 7,
  proposalId,
  expectedProposalRevision: 2,
  requestId: 'a1000000-0000-4000-8000-000000000001',
};
const receipt = {
  proposal_id: proposalId,
  proposal_revision: 3,
  proposal_status: 'withdrawn',
  booking_id: bookingId,
  booking_revision: 7,
  booking_status: 'confirmed',
  starts_at: '2026-10-05T10:00:00Z',
  ends_at: '2026-10-05T11:00:00Z',
  replayed: true,
};
const getSession = jest.fn();
const header = jest.fn();
const rpc = jest.fn().mockImplementation(() => ({ setHeader: header }));
const session = (id: string) => ({
  data: {
    session: {
      user: { id },
      access_token: bookingAuthFixture(id).session().access_token,
    },
  },
  error: null,
});
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  getSession.mockResolvedValue(session(userId));
  header.mockResolvedValue({ data: receipt, error: null });
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: { ...bookingAuthFixture(userId).auth, getSession },
    from: schedulingAuthFixture(userId, workspaceId).from,
    rpc,
  } as unknown as SupabaseClient<Database>);
});

test('uncertain command remains owned by original account through account switch and restart', async () => {
  header.mockRejectedValueOnce(new Error('lost after server committed'));
  await expect(
    submitWorkspaceProposal(userId, workspaceId, command),
  ).rejects.toMatchObject({ code: 'request' });
  expect(await loadPendingWorkspaceProposal(userId, workspaceId)).toEqual(
    command,
  );
  getSession.mockResolvedValue(session(otherUserId));
  expect(await resumeWorkspaceProposal(otherUserId, workspaceId)).toBeNull();
  await expect(
    resumeWorkspaceProposal(userId, workspaceId),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(await loadPendingWorkspaceProposal(userId, workspaceId)).toEqual(
    command,
  );
  getSession.mockResolvedValue(session(userId));
  await expect(
    resumeWorkspaceProposal(userId, workspaceId),
  ).resolves.toMatchObject({
    replayed: true,
    bookingRevision: 7,
    proposalStatus: 'withdrawn',
  });
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  expect(await loadPendingWorkspaceProposal(userId, workspaceId)).toBeNull();
});

test('malformed applied receipt cannot clear command; only validated immutable replay does', async () => {
  header.mockResolvedValueOnce({
    data: { ...receipt, booking_revision: 8 },
    error: null,
  });
  await expect(
    submitWorkspaceProposal(userId, workspaceId, command),
  ).rejects.toMatchObject({ code: 'request' });
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  expect(await loadPendingWorkspaceProposal(userId, workspaceId)).toEqual(
    command,
  );
  await expect(
    resumeWorkspaceProposal(userId, workspaceId),
  ).resolves.toMatchObject({ bookingRevision: 7, proposalRevision: 3 });
  expect(await loadPendingWorkspaceProposal(userId, workspaceId)).toBeNull();
});

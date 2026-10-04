import {
  assignmentJwt,
  assignmentSessionId,
  nextAssignmentSessionId,
} from './assignment-jwt';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Crypto from 'expo-crypto';
import {
  clearPendingClientProgramAssignment,
  loadPendingClientProgramAssignment,
  savePendingClientProgramAssignment,
} from '../src/features/workspace-programs/pending';
import {
  createAssignClientProgramOperation,
  type WorkspaceProgramAssignmentResult,
} from '../src/features/workspace-programs/service';
import { useClientProgramAssignment } from '../src/features/workspace-programs/use-assignment';

const mockGetSession = jest.fn();
let mockAuthListener:
  | ((
      event: string,
      session: { access_token: string; user: { id: string } } | null,
    ) => void)
  | null = null;
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: (listener: typeof mockAuthListener) => {
        mockAuthListener = listener;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../src/features/workspace-programs/pending', () => ({
  ...jest.requireActual('../src/features/workspace-programs/pending'),
  clearPendingClientProgramAssignment: jest.fn(),
  loadPendingClientProgramAssignment: jest.fn(),
  savePendingClientProgramAssignment: jest.fn(),
}));
jest.mock('../src/features/workspace-programs/service', () => ({
  createAssignClientProgramOperation: jest.fn(),
  WorkspaceProgramAssignmentError: class WorkspaceProgramAssignmentError extends Error {
    readonly code: string;
    constructor(mockCode: string) {
      super(mockCode);
      this.code = mockCode;
    }
  },
}));

const userId = '51000000-0000-4000-8000-000000000001';
const workspaceId = '61000000-0000-4000-8000-000000000001';
const clientRecordId = '71000000-0000-4000-8000-000000000001';
const templateId = '81000000-0000-4000-8000-000000000001';
const requestId = 'a1000000-0000-4000-8000-000000000001';
const programId = '91000000-0000-4000-8000-000000000001';
const result: WorkspaceProgramAssignmentResult = {
  id: programId,
  revision: 1,
  replayed: false,
};
const loadPending = jest.mocked(loadPendingClientProgramAssignment);
const savePending = jest.mocked(savePendingClientProgramAssignment);
const clearPending = jest.mocked(clearPendingClientProgramAssignment);
const createOperation = jest.mocked(createAssignClientProgramOperation);
const randomUUID = jest.mocked(Crypto.randomUUID);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const mount = async (
  currentUserId: string | null = userId,
  onAssigned = jest.fn(),
) =>
  await renderHook(
    ({ activeUserId }: { activeUserId: string | null }) =>
      useClientProgramAssignment({
        userId: activeUserId,
        workspaceId,
        clientRecordId,
        onAssigned,
      }),
    { initialProps: { activeUserId: currentUserId } },
  );

const installSuccessOperation = (
  execute: () => Promise<WorkspaceProgramAssignmentResult> = async () => result,
) => {
  const operation = { execute: jest.fn(execute) };
  createOperation.mockReturnValue(operation);
  return operation;
};

beforeEach(() => {
  mockAuthListener = null;
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: assignmentJwt(userId, assignmentSessionId, 'token'),
        user: { id: userId },
      },
    },
    error: null,
  });
  randomUUID.mockReset();
  savePending.mockReset();
  loadPending.mockReset();
  clearPending.mockReset();
  createOperation.mockReset();
  randomUUID.mockReturnValue(requestId);
  loadPending.mockResolvedValue(null);
  savePending.mockResolvedValue(undefined);
  clearPending.mockResolvedValue(true);
});

describe('real assignment auth session integration', () => {
  it.each(['SIGNED_OUT', 'TOKEN_REFRESHED'] as const)(
    'fences the RPC according to %s',
    async (event) => {
      const execution = deferred<WorkspaceProgramAssignmentResult>();
      installSuccessOperation(() => execution.promise);
      const onAssigned = jest.fn();
      const hook = await mount(userId, onAssigned);
      await waitFor(() => expect(hook.result.current.loading).toBe(false));
      let assignment!: Promise<void>;
      await act(async () => {
        assignment = hook.result.current.assign(templateId, 4);
        await Promise.resolve();
      });
      await waitFor(() => expect(createOperation).toHaveBeenCalledTimes(1));
      const session = createOperation.mock.calls[0]![0].session;
      await act(async () => {
        mockAuthListener?.(
          event,
          event === 'SIGNED_OUT'
            ? null
            : {
                access_token: assignmentJwt(
                  userId,
                  assignmentSessionId,
                  'refresh-token',
                ),
                user: { id: userId },
              },
        );
      });
      if (event === 'SIGNED_OUT') {
        expect(hook.result.current.pending).toBeNull();
        expect(hook.result.current.error).toBe('unavailable');
        mockGetSession.mockResolvedValue({
          data: {
            session: {
              access_token: assignmentJwt(
                userId,
                assignmentSessionId,
                'new-token',
              ),
              user: { id: userId },
            },
          },
          error: null,
        });
        loadPending.mockResolvedValueOnce({
          clientRecordId,
          templateId,
          expectedTemplateRevision: 4,
          requestId,
        });
        await act(async () => {
          mockAuthListener?.('SIGNED_IN', {
            access_token: assignmentJwt(
              userId,
              assignmentSessionId,
              'new-token',
            ),
            user: { id: userId },
          });
        });
        await waitFor(() =>
          expect(hook.result.current.pending?.requestId).toBe(requestId),
        );
      }
      if (event === 'TOKEN_REFRESHED') {
        mockGetSession.mockResolvedValue({
          data: {
            session: {
              access_token: assignmentJwt(
                userId,
                assignmentSessionId,
                'refresh-token',
              ),
              user: { id: userId },
            },
          },
          error: null,
        });
        await expect(session?.token()).resolves.toBe(
          assignmentJwt(userId, assignmentSessionId, 'refresh-token'),
        );
      }
      await act(async () => {
        execution.resolve(result);
        await assignment;
      });
      if (event === 'SIGNED_OUT') {
        expect(session?.valid()).toBe(false);
        expect(clearPending).not.toHaveBeenCalled();
        expect(onAssigned).not.toHaveBeenCalled();
        expect(hook.result.current.pending?.requestId).toBe(requestId);
        expect(hook.result.current.busy).toBe(false);
        installSuccessOperation();
        await act(async () => {
          await hook.result.current.assign();
        });
        expect(createOperation).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ requestId }),
        );
        expect(onAssigned).toHaveBeenCalledWith(result);
      } else {
        expect(session?.valid()).toBe(true);
        expect(onAssigned).toHaveBeenCalledWith(result);
        expect(clearPending).toHaveBeenCalledTimes(1);
      }
    },
  );
});

describe('different JWT session refresh during storage', () => {
  it.each(['load', 'save', 'rpc', 'clear'] as const)(
    'retains the request without notifying the owner after %s invalidation',
    async (stage) => {
      const pending = {
        clientRecordId,
        templateId,
        expectedTemplateRevision: 4,
        requestId,
      };
      const loading = deferred<typeof pending | null>();
      const saving = deferred<void>();
      const execution = deferred<WorkspaceProgramAssignmentResult>();
      const clearing = deferred<boolean>();
      if (stage === 'load') loadPending.mockReturnValueOnce(loading.promise);
      if (stage === 'save') savePending.mockReturnValueOnce(saving.promise);
      if (stage === 'clear') clearPending.mockReturnValueOnce(clearing.promise);
      installSuccessOperation(
        stage === 'rpc' ? () => execution.promise : undefined,
      );
      const onAssigned = jest.fn();
      const hook = await mount(userId, onAssigned);
      let assignment = Promise.resolve();
      if (stage === 'load') {
        await waitFor(() => expect(loadPending).toHaveBeenCalled());
      } else {
        await waitFor(() => expect(hook.result.current.loading).toBe(false));
        await act(async () => {
          assignment = hook.result.current.assign(templateId, 4);
          await Promise.resolve();
        });
        if (stage === 'save')
          await waitFor(() => expect(savePending).toHaveBeenCalled());
        if (stage === 'rpc')
          await waitFor(() => expect(createOperation).toHaveBeenCalled());
        if (stage === 'clear')
          await waitFor(() => expect(clearPending).toHaveBeenCalled());
      }
      await act(async () => {
        mockAuthListener?.('TOKEN_REFRESHED', {
          user: { id: userId },
          access_token: assignmentJwt(userId, nextAssignmentSessionId),
        });
        loading.resolve(pending);
        saving.resolve();
        execution.resolve(result);
        clearing.resolve(false);
        await assignment;
      });
      expect(onAssigned).not.toHaveBeenCalled();
      if (stage === 'load' || stage === 'save')
        expect(createOperation).not.toHaveBeenCalled();
      if (stage === 'rpc') expect(clearPending).not.toHaveBeenCalled();
      if (stage === 'clear')
        expect(clearPending.mock.calls[0]![4]?.()).toBe(false);
      loadPending.mockResolvedValue(pending);
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            user: { id: userId },
            access_token: assignmentJwt(userId, nextAssignmentSessionId),
          },
        },
        error: null,
      });
      const callsBeforeLogin = createOperation.mock.calls.length;
      await act(async () => {
        mockAuthListener?.('SIGNED_IN', {
          user: { id: userId },
          access_token: assignmentJwt(userId, nextAssignmentSessionId),
        });
      });
      await waitFor(() =>
        expect(hook.result.current.pending?.requestId).toBe(requestId),
      );
      expect(createOperation).toHaveBeenCalledTimes(callsBeforeLogin);
      loadPending.mockResolvedValue(null);
      installSuccessOperation(async () => ({ ...result, replayed: true }));
      await act(async () => {
        await hook.result.current.assign();
      });
      expect(createOperation).toHaveBeenLastCalledWith(
        expect.objectContaining({ requestId }),
      );
      expect(onAssigned).toHaveBeenCalledWith({ ...result, replayed: true });
    },
  );
});

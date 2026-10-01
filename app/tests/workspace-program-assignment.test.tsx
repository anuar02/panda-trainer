import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Crypto from 'expo-crypto';
import {
  clearPendingClientProgramAssignment,
  loadPendingClientProgramAssignment,
  PendingClientProgramAssignmentError,
  savePendingClientProgramAssignment,
  type PendingClientProgramAssignment,
} from '../src/features/workspace-programs/pending';
import {
  createAssignClientProgramOperation,
  WorkspaceProgramAssignmentError,
  type WorkspaceProgramAssignmentResult,
} from '../src/features/workspace-programs/service';
import { useClientProgramAssignment } from '../src/features/workspace-programs/use-assignment';

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
const otherUserId = '51000000-0000-4000-8000-000000000002';
const workspaceId = '61000000-0000-4000-8000-000000000001';
const clientRecordId = '71000000-0000-4000-8000-000000000001';
const templateId = '81000000-0000-4000-8000-000000000001';
const otherTemplateId = '81000000-0000-4000-8000-000000000002';
const requestId = 'a1000000-0000-4000-8000-000000000001';
const nextRequestId = 'a1000000-0000-4000-8000-000000000002';
const programId = '91000000-0000-4000-8000-000000000001';
const result: WorkspaceProgramAssignmentResult = {
  id: programId,
  revision: 1,
  replayed: false,
};
const pending: PendingClientProgramAssignment = {
  clientRecordId,
  templateId,
  expectedTemplateRevision: 4,
  requestId,
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

describe('client program assignment hook lifecycle', () => {
  it('waits for durable pending storage before issuing the assignment RPC', async () => {
    const storage = deferred<void>();
    savePending.mockReturnValue(storage.promise);
    const operation = installSuccessOperation();
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    let assignment!: Promise<void>;
    await act(async () => {
      assignment = hook.result.current.assign(templateId, 4);
      await Promise.resolve();
    });
    expect(savePending).toHaveBeenCalledWith(userId, workspaceId, pending);
    expect(createOperation).not.toHaveBeenCalled();

    await act(async () => {
      storage.resolve();
      await assignment;
    });
    expect(createOperation).toHaveBeenCalledWith({
      clientRecordId,
      templateId,
      expectedTemplateRevision: 4,
      expectedUserId: userId,
      requestId,
    });
    expect(operation.execute).toHaveBeenCalledTimes(1);
  });

  it.each(['unmount', 'account change'] as const)(
    'does not issue the RPC or callback after %s while persistence is pending',
    async (lifecycle) => {
      const storage = deferred<void>();
      savePending.mockReturnValue(storage.promise);
      installSuccessOperation();
      const onAssigned = jest.fn();
      const hook = await mount(userId, onAssigned);
      await waitFor(() => expect(hook.result.current.loading).toBe(false));

      let assignment!: Promise<void>;
      await act(async () => {
        assignment = hook.result.current.assign(templateId, 4);
        await Promise.resolve();
      });

      if (lifecycle === 'unmount') await hook.unmount();
      else await hook.rerender({ activeUserId: otherUserId });

      await act(async () => {
        storage.resolve();
        await assignment;
      });
      expect(createOperation).not.toHaveBeenCalled();
      expect(onAssigned).not.toHaveBeenCalled();
    },
  );

  it('releases the old request lock after an account change', async () => {
    const storage = deferred<void>();
    savePending.mockReturnValueOnce(storage.promise);
    installSuccessOperation();
    const hook = await mount(userId);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    let oldAssignment!: Promise<void>;
    await act(async () => {
      oldAssignment = hook.result.current.assign(templateId, 4);
      await Promise.resolve();
    });
    await hook.rerender({ activeUserId: otherUserId });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => {
      storage.resolve();
      await oldAssignment;
    });

    expect(hook.result.current.busy).toBe(false);
    await act(async () => {
      await hook.result.current.assign(otherTemplateId, 9);
    });
    expect(savePending).toHaveBeenCalledTimes(2);
    expect(createOperation).toHaveBeenCalledWith({
      clientRecordId,
      templateId: otherTemplateId,
      expectedTemplateRevision: 9,
      expectedUserId: otherUserId,
      requestId,
    });
  });

  it('retries the persisted command and ignores a newly selected template', async () => {
    loadPending.mockResolvedValueOnce(pending).mockResolvedValueOnce(null);
    const operation = installSuccessOperation();
    const onAssigned = jest.fn();
    const hook = await mount(userId, onAssigned);
    await waitFor(() => expect(hook.result.current.pending).toEqual(pending));

    await act(async () => {
      await hook.result.current.assign(otherTemplateId, 9);
    });

    expect(createOperation).toHaveBeenCalledWith({
      clientRecordId,
      templateId,
      expectedTemplateRevision: 4,
      expectedUserId: userId,
      requestId,
    });
    expect(operation.execute).toHaveBeenCalledTimes(1);
    expect(clearPending).toHaveBeenCalledWith(
      userId,
      workspaceId,
      clientRecordId,
      requestId,
    );
    expect(onAssigned).toHaveBeenCalledWith(result);
  });

  it('blocks assignment during a same-scope pending reload instead of using stale data', async () => {
    const refreshed = deferred<PendingClientProgramAssignment | null>();
    loadPending
      .mockResolvedValueOnce(pending)
      .mockReturnValueOnce(refreshed.promise)
      .mockResolvedValue(null);
    installSuccessOperation();
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.pending).toEqual(pending));

    await act(async () => {
      hook.result.current.reload();
    });
    expect(hook.result.current.loading).toBe(true);

    await act(async () => {
      await hook.result.current.assign(otherTemplateId, 9);
    });
    expect(savePending).not.toHaveBeenCalled();
    expect(createOperation).not.toHaveBeenCalled();

    await act(async () => {
      refreshed.resolve(null);
      await refreshed.promise;
    });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => {
      await hook.result.current.assign(otherTemplateId, 9);
    });

    expect(createOperation).toHaveBeenCalledWith({
      clientRecordId,
      templateId: otherTemplateId,
      expectedTemplateRevision: 9,
      expectedUserId: userId,
      requestId,
    });
  });

  it('keeps the request UUID after a successful RPC whose local clear fails', async () => {
    randomUUID.mockReturnValueOnce(requestId).mockReturnValue(nextRequestId);
    clearPending
      .mockRejectedValueOnce(new PendingClientProgramAssignmentError('storage'))
      .mockResolvedValueOnce(true);
    const operation = installSuccessOperation(async () => ({
      ...result,
      replayed: true,
    }));
    const onAssigned = jest.fn();
    const hook = await mount(userId, onAssigned);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    await act(async () => {
      await hook.result.current.assign(templateId, 4);
    });
    expect(hook.result.current.error).toBe('storage');
    expect(hook.result.current.pending?.requestId).toBe(requestId);
    expect(onAssigned).not.toHaveBeenCalled();

    await act(async () => {
      await hook.result.current.assign(otherTemplateId, 9);
    });
    expect(createOperation).toHaveBeenCalledTimes(2);
    expect(createOperation).toHaveBeenNthCalledWith(2, {
      clientRecordId,
      templateId,
      expectedTemplateRevision: 4,
      expectedUserId: userId,
      requestId,
    });
    expect(operation.execute).toHaveBeenCalledTimes(2);
    expect(clearPending).toHaveBeenCalledTimes(2);
    expect(onAssigned).toHaveBeenCalledWith({ ...result, replayed: true });
  });

  it('blocks assignment when persisted pending data is corrupt', async () => {
    loadPending.mockRejectedValue(
      new PendingClientProgramAssignmentError('invalid'),
    );
    installSuccessOperation();
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    expect(hook.result.current.error).toBe('invalidPending');
    await act(async () => {
      await hook.result.current.assign(templateId, 4);
    });
    expect(savePending).not.toHaveBeenCalled();
    expect(createOperation).not.toHaveBeenCalled();
  });

  it('blocks assignment when loading pending data throws synchronously', async () => {
    loadPending.mockImplementation(() => {
      throw new PendingClientProgramAssignmentError('invalid');
    });
    installSuccessOperation();
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    expect(hook.result.current.error).toBe('invalidPending');
    await act(async () => {
      await hook.result.current.assign(templateId, 4);
    });
    expect(savePending).not.toHaveBeenCalled();
    expect(createOperation).not.toHaveBeenCalled();
  });

  it.each([
    { code: 'notFound' as const, clears: true, error: 'notFound' as const },
    { code: 'request' as const, clears: false, error: 'request' as const },
  ])(
    'clears terminal $code errors and preserves ambiguous requests',
    async ({ code, clears, error }) => {
      loadPending.mockResolvedValueOnce(pending).mockResolvedValueOnce(null);
      const operation = installSuccessOperation(async () => {
        throw new WorkspaceProgramAssignmentError(code);
      });
      const hook = await mount();
      await waitFor(() => expect(hook.result.current.pending).toEqual(pending));

      await act(async () => {
        await hook.result.current.assign();
      });

      expect(operation.execute).toHaveBeenCalledTimes(1);
      expect(hook.result.current.error).toBe(error);
      if (clears) {
        expect(clearPending).toHaveBeenCalledWith(
          userId,
          workspaceId,
          clientRecordId,
          requestId,
        );
        expect(hook.result.current.pending).toBeNull();
      } else {
        expect(clearPending).not.toHaveBeenCalled();
        expect(hook.result.current.pending).toEqual(pending);
      }
    },
  );

  it('keeps a terminal result unresolved when local clearing fails', async () => {
    loadPending.mockResolvedValueOnce(pending).mockResolvedValueOnce(null);
    clearPending.mockRejectedValue(
      new PendingClientProgramAssignmentError('storage'),
    );
    const operation = installSuccessOperation(async () => {
      throw new WorkspaceProgramAssignmentError('notFound');
    });
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.pending).toEqual(pending));

    await act(async () => {
      await hook.result.current.assign();
    });

    expect(operation.execute).toHaveBeenCalledTimes(1);
    expect(hook.result.current.error).toBe('storage');
    expect(hook.result.current.pending).toEqual(pending);
  });
});

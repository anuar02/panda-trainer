import { createAccountExportCollector } from '@/features/account-export/collector';
import { AccountExportError } from '@/features/account-export/service';
import { fluentRpc, syntheticToken } from './test-transport';
import snapshot from './snapshot.json';
import {
  createExportController,
  type ExportStatus,
  type AccountExportCollector,
} from '@/features/account-export/controller';
import {
  exportFileOutcome,
  type ExportDelivery,
  ExportFileError,
} from '@/features/account-export/file-contract';
const scope = {
  userId: snapshot.owner_user_id,
  workspaceId: snapshot.workspace_id,
  token: syntheticToken(snapshot.owner_user_id),
};
function setup(collect?: AccountExportCollector) {
  const session = { user: { id: scope.userId }, access_token: scope.token };
  const transport = {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session },
        error: null as unknown,
      })),
    },
    rpc: fluentRpc(async () => ({
      data: snapshot as unknown,
      error: null,
      status: 200,
    })),
  };
  const statuses: ExportStatus[] = [];
  const file = jest.fn(
    async (
      _json: string,
      _scope: unknown,
      guard: () => Promise<void>,
      delivery?: ExportDelivery,
    ) => {
      await guard();
      return exportFileOutcome('saved', _json, scope, delivery);
    },
  );
  let current = true;
  const controller = createExportController(
    transport,
    scope,
    file,
    (status) => statuses.push(status),
    () => current,
    collect,
  );
  return {
    controller,
    transport,
    file,
    statuses,
    session,
    switchWorkspace: () => {
      current = false;
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
test('prepare is separate from user save and preserves every exact JSON value/order', async () => {
  const x = setup();
  await x.controller.prepare();
  expect(x.file).not.toHaveBeenCalled();
  expect(x.statuses).toEqual(['loading', 'readyIncomplete']);
  await x.controller.save();
  expect(JSON.parse(x.file.mock.calls[0]?.[0] ?? '{}')).toMatchObject({
    version: 2,
    status: 'incomplete',
    server: snapshot,
    globalAtomicity: 'unknown',
  });
  expect(x.statuses.at(-1)).toBe('saved');
  await x.controller.save();
  expect(x.file).toHaveBeenCalledTimes(1);
});
test('single flight, cancellation, late response and fresh retry', async () => {
  const x = setup();
  const pending = deferred<{ data: unknown; error: null; status: number }>();
  x.transport.rpc.mockImplementationOnce(() => pending.promise);
  const first = x.controller.prepare();
  while (!x.transport.rpc.mock.calls.length) await Promise.resolve();
  await x.controller.prepare();
  expect(x.transport.rpc).toHaveBeenCalledTimes(1);
  x.controller.cancel();
  pending.resolve({ data: snapshot, error: null, status: 200 });
  await first;
  expect(x.statuses).toEqual(['loading', 'cancelling', 'cancelled']);
  await x.controller.save();
  expect(x.file).not.toHaveBeenCalled();
  await x.controller.prepare();
  await x.controller.save();
  expect(x.statuses.at(-1)).toBe('saved');
});
test.each(['account', 'token', 'workspace', 'logout'] as const)(
  'fences %s switch after prepare before file',
  async (kind) => {
    const x = setup();
    await x.controller.prepare();
    if (kind === 'account')
      x.session.user.id = '00000000-0000-4000-8000-000000000099';
    if (kind === 'token') x.session.access_token = 'new-session';
    if (kind === 'workspace') x.switchWorkspace();
    if (kind === 'logout') x.controller.stop();
    await x.controller.save();
    expect(x.statuses).not.toContain('saved');
  },
);
test('scope changes during guard await fence same account/workspace return', async () => {
  const x = setup();
  const pending =
    deferred<Awaited<ReturnType<typeof x.transport.auth.getSession>>>();
  x.transport.auth.getSession.mockImplementationOnce(() => pending.promise);
  const first = x.controller.prepare();
  x.switchWorkspace();
  pending.resolve({ data: { session: x.session }, error: null });
  await first;
  expect(x.transport.rpc).not.toHaveBeenCalled();
  expect(x.statuses).toEqual(['loading']);
});
test('malformed payload never becomes a file; retry gets a fresh snapshot', async () => {
  const x = setup();
  x.transport.rpc.mockResolvedValueOnce({
    data: { ...snapshot, version: 88 },
    error: null,
    status: 200,
  });
  await x.controller.prepare();
  expect(x.statuses.at(-1)).toBe('unsupportedVersion');
  await x.controller.save();
  expect(x.file).not.toHaveBeenCalled();
  await x.controller.prepare();
  await x.controller.save();
  expect(x.statuses.at(-1)).toBe('saved');
});
test.each(['storage', 'share', 'cleanup', 'unsupported'] as const)(
  'file %s failures require fresh prepare',
  async (code) => {
    const x = setup();
    x.file.mockRejectedValueOnce(new ExportFileError(code));
    await x.controller.prepare();
    await x.controller.save();
    expect(x.statuses.at(-1)).toBe(code);
    await x.controller.save();
    expect(x.file).toHaveBeenCalledTimes(1);
    await x.controller.prepare();
    await x.controller.save();
    expect(x.statuses.at(-1)).toBe('saved');
  },
);
test('transport rejection stays a localized network code', async () => {
  const x = setup();
  x.transport.rpc.mockRejectedValueOnce(
    new Error('synthetic transport failure'),
  );
  await x.controller.prepare();
  expect(x.statuses.at(-1)).toBe('network');
  expect(x.file).not.toHaveBeenCalled();
});
test('cancel during file API prevents stale success', async () => {
  const x = setup();
  const pending = deferred<{ result: 'saved'; evidence: null }>();
  x.file.mockImplementationOnce(async () => pending.promise);
  await x.controller.prepare();
  const save = x.controller.save();
  x.controller.cancel();
  pending.resolve({ result: 'saved', evidence: null });
  await save;
  expect(x.statuses.at(-1)).toBe('cancelled');
  expect(x.statuses).not.toContain('saved');
});

test('cleanup failure during cancellation remains visible', async () => {
  const x = setup();
  const pending = deferred<{ result: 'saved'; evidence: null }>();
  x.file.mockImplementationOnce(async () => pending.promise);
  await x.controller.prepare();
  const save = x.controller.save();
  x.controller.cancel();
  pending.reject(new ExportFileError('cleanup'));
  await save;
  expect(x.statuses.at(-1)).toBe('cleanup');
});

test('bounded read times out without publishing later response', async () => {
  jest.useFakeTimers();
  try {
    const x = setup();
    const pending = deferred<{ data: unknown; error: null; status: number }>();
    x.transport.rpc.mockImplementationOnce(() => pending.promise);
    const prepare = x.controller.prepare();
    while (!x.transport.rpc.mock.calls.length) await Promise.resolve();
    await jest.advanceTimersByTimeAsync(30000);
    await prepare;
    expect(x.statuses.at(-1)).toBe('network');
    pending.resolve({ data: snapshot, error: null, status: 200 });
    await Promise.resolve();
    expect(x.statuses).not.toContain('readyIncomplete');
    expect(x.file).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test('initial auth read is also bounded and cannot request after timeout', async () => {
  jest.useFakeTimers();
  try {
    const x = setup();
    const pending =
      deferred<Awaited<ReturnType<typeof x.transport.auth.getSession>>>();
    x.transport.auth.getSession.mockImplementationOnce(() => pending.promise);
    const prepare = x.controller.prepare();
    await jest.advanceTimersByTimeAsync(30000);
    await prepare;
    expect(x.statuses.at(-1)).toBe('network');
    pending.resolve({ data: { session: x.session }, error: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(x.transport.rpc).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
test('wrong file snapshot evidence cannot publish saved success', async () => {
  const x = setup();
  x.file.mockImplementationOnce(async (json, _scope, guard, delivery) => {
    await guard();
    const outcome = await exportFileOutcome('saved', json, scope, delivery);
    if (!outcome.evidence) throw new Error('missing fixture evidence');
    return {
      ...outcome,
      evidence: { ...outcome.evidence, snapshotId: 'foreign-snapshot' },
    };
  });
  await x.controller.prepare();
  await x.controller.save();
  expect(x.statuses.at(-1)).toBe('storage');
  expect(x.statuses).not.toContain('saved');
});
test('server writer change between prepare and file guard prevents delivery', async () => {
  const x = setup();
  await x.controller.prepare();
  x.transport.rpc.mockResolvedValueOnce({
    data: {
      ...snapshot,
      collections: {
        ...snapshot.collections,
        profiles: snapshot.collections.profiles.map((profile) => ({
          ...profile,
          display_name: 'Changed synthetic profile',
        })),
      },
    },
    error: null,
    status: 200,
  });
  await x.controller.save();
  expect(x.statuses.at(-1)).toBe('stale');
  expect(x.statuses).not.toContain('saved');
});
test('unmount suppresses late cleanup error as well as success', async () => {
  const x = setup();
  const pending = deferred<{ result: 'saved'; evidence: null }>();
  x.file.mockImplementationOnce(async () => pending.promise);
  await x.controller.prepare();
  const save = x.controller.save();
  x.controller.stop();
  const statuses = [...x.statuses];
  pending.reject(new ExportFileError('cleanup'));
  await save;
  expect(x.statuses).toEqual(statuses);
});
test('local acknowledgement during file guard blocks saved outcome', async () => {
  let acknowledged = false;
  const collect: AccountExportCollector = async (...argumentsList) => {
    const collected = await createAccountExportCollector({ local: null })(
      ...argumentsList,
    );
    return {
      ...collected,
      validate: async () => {
        if (acknowledged) throw new AccountExportError('stale');
        await collected.validate();
      },
    };
  };
  const x = setup(collect);
  await x.controller.prepare();
  x.file.mockImplementationOnce(async (json, _scope, guard, delivery) => {
    acknowledged = true;
    await guard();
    return exportFileOutcome('saved', json, scope, delivery);
  });
  await x.controller.save();
  expect(x.statuses.at(-1)).toBe('stale');
  expect(x.statuses).not.toContain('saved');
});
test('late RPC rejection after silent session change cannot publish old network error', async () => {
  const x = setup();
  const pending = deferred<{ data: unknown; error: null; status: number }>();
  x.transport.rpc.mockImplementationOnce(() => pending.promise);
  const prepare = x.controller.prepare();
  for (let i = 0; i < 100 && !x.transport.rpc.mock.calls.length; i += 1)
    await Promise.resolve();
  expect(x.transport.rpc).toHaveBeenCalledTimes(1);
  x.session.access_token = syntheticToken(
    scope.userId,
    '00000000-0000-4000-8000-000000000099',
  );
  pending.reject(new Error('synthetic late network failure'));
  await prepare;
  expect(x.statuses).not.toContain('network');
  expect(x.statuses).not.toContain('readyIncomplete');
  expect(x.file).not.toHaveBeenCalled();
});
test('caller token mutation during auth await cannot bind original controller to a new session', async () => {
  const x = setup();
  const mutableScope = { ...scope };
  const statuses: ExportStatus[] = [];
  const pending =
    deferred<Awaited<ReturnType<typeof x.transport.auth.getSession>>>();
  x.transport.auth.getSession.mockImplementationOnce(() => pending.promise);
  const controller = createExportController(
    x.transport,
    mutableScope,
    x.file,
    (status) => statuses.push(status),
  );
  const prepare = controller.prepare();
  mutableScope.token = syntheticToken(
    scope.userId,
    '00000000-0000-4000-8000-000000000099',
  );
  x.session.access_token = mutableScope.token;
  pending.resolve({ data: { session: x.session }, error: null });
  await prepare;
  await controller.save();
  expect(statuses).not.toContain('readyIncomplete');
  expect(statuses).not.toContain('saved');
  expect(x.transport.rpc).not.toHaveBeenCalled();
  expect(x.file).not.toHaveBeenCalled();
});

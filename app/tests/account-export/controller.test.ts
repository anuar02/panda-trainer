import snapshot from './snapshot.json';
import {
  createExportController,
  type ExportStatus,
} from '@/features/account-export/controller';
import { ExportFileError } from '@/features/account-export/file-contract';
const scope = {
  userId: snapshot.owner_user_id,
  workspaceId: snapshot.workspace_id,
  token: 'synthetic',
};
function setup() {
  const session = { user: { id: scope.userId }, access_token: scope.token };
  const transport = {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session },
        error: null as unknown,
      })),
    },
    rpc: jest.fn(async () => ({
      data: snapshot as unknown,
      error: null,
      status: 200,
    })),
  };
  const statuses: ExportStatus[] = [];
  const file = jest.fn(
    async (_json: string, _scope: unknown, guard: () => Promise<void>) => {
      await guard();
      return 'saved' as const;
    },
  );
  let current = true;
  const controller = createExportController(
    transport,
    scope,
    file,
    (status) => statuses.push(status),
    () => current,
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
  expect(x.statuses).toEqual(['loading', 'ready']);
  await x.controller.save();
  expect(x.file.mock.calls[0]?.[0]).toBe(JSON.stringify(snapshot));
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
  const pending = deferred<'saved'>();
  x.file.mockImplementationOnce(async () => pending.promise);
  await x.controller.prepare();
  const save = x.controller.save();
  x.controller.cancel();
  pending.resolve('saved');
  await save;
  expect(x.statuses.at(-1)).toBe('cancelled');
  expect(x.statuses).not.toContain('saved');
});

test('cleanup failure during cancellation remains visible', async () => {
  const x = setup();
  const pending = deferred<'saved'>();
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
    expect(x.statuses).not.toContain('ready');
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

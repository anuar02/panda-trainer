import { sendDeletion } from '@/features/account-deletion/service';
import {
  createDeletionController,
  type DeletionDependencies,
} from '@/features/account-deletion/controller';
import type { DeletionLocalSnapshot } from '@/features/account-deletion/local';
import type { ConfirmedDeletion } from '@/features/account-deletion/pending';

jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));

const accountId = '10000000-0000-4000-8000-000000000001';
const identity = {
  accountId,
  token: 'synthetic-session-a',
  sessionId: '10000000-0000-4000-8000-000000000003',
};
const snapshot: DeletionLocalSnapshot = {
  accountId,
  fingerprint: 'a'.repeat(64),
  records: [
    { source: 'synthetic-cache', rows: [{ text: 'Локальная запись' }] },
  ],
  outstanding: 0,
};
const restored: ConfirmedDeletion = {
  accountId,
  fingerprint: snapshot.fingerprint,
  requestId: '20000000-0000-4000-8000-000000000001',
  recoveryToken: 'b'.repeat(64),
  snapshotId: '30000000-0000-4000-8000-000000000001',
  exportSha256: 'c'.repeat(64),
  exportBytes: 100,
  confirmed: true,
};
function fixture(intent: ConfirmedDeletion | null = null) {
  const deps: DeletionDependencies = {
    guard: jest.fn(async () => {}),
    inspect: jest.fn(async () => ({
      user_id: accountId,
      workspace_ids: [],
      foreign_client_card_count: 2,
      has_trainer_workspace: false,
      has_client_cards: true,
    })),
    read: jest.fn(async () => ({ ...snapshot })),
    hash: jest.fn(async () => 'c'.repeat(64)),
    uuid: jest.fn(() => restored.requestId),
    secret: jest.fn(() => 'b'.repeat(64)),
    file: jest.fn(async (_json, scope, guard, delivery) => {
      await guard();
      return {
        result: 'saved' as const,
        evidence: delivery
          ? {
              ...scope,
              ...delivery,
              disposition: 'saved' as const,
              exactUtf8: true as const,
              freshness: 'unknown' as const,
              globalAtomicity: 'unknown' as const,
              verification: 'adapter-reported' as const,
            }
          : null,
      };
    }),
    persist: jest.fn(async () => {}),
    shutdown: jest.fn(async () => {}),
    send: jest.fn(async () => 'complete'),
    cleanup: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
    publish: jest.fn(),
  };
  const controller = createDeletionController(identity, deps, intent);
  const prepare = async () => {
    await controller.explain();
    await controller.prepare();
    await controller.export();
  };
  const confirm = async () => {
    await prepare();
    await controller.acknowledge();
  };
  return { controller, deps, prepare, confirm };
}

test('verified export and explicit acknowledgement precede durable intent and shutdown', async () => {
  const { controller, deps, confirm } = fixture();
  await confirm();
  await controller.delete();
  expect(deps.persist).toHaveBeenCalledWith(
    expect.objectContaining({ confirmed: true, accountId }),
  );
  expect(deps.send).toHaveBeenCalledWith(
    'delete',
    expect.objectContaining({ accountId }),
    identity.token,
  );
  expect(deps.cleanup).toHaveBeenCalledWith(snapshot);
  expect(deps.clear).toHaveBeenCalledTimes(1);
  expect(deps.publish).toHaveBeenLastCalledWith(
    'complete',
    expect.any(Object),
    0,
  );
});

test('export alone does not authorize deletion before consequence acknowledgement', async () => {
  const { controller, deps, prepare } = fixture();
  await prepare();
  await controller.delete();
  expect(deps.persist).not.toHaveBeenCalled();
  expect(deps.send).not.toHaveBeenCalled();
});

test.each(['cancel', 'error', 'missing-proof', 'foreign-proof'] as const)(
  '%s export keeps server deletion disabled',
  async (mode) => {
    const { controller, deps } = fixture();
    const originalFile = deps.file;
    deps.file = jest.fn(async (...parameters) => {
      if (mode === 'error') throw new Error('file unavailable');
      if (mode === 'foreign-proof') {
        const result = await originalFile(...parameters);
        return {
          ...result,
          evidence: result.evidence
            ? { ...result.evidence, userId: 'foreign' }
            : null,
        };
      }
      return {
        result: mode === 'cancel' ? ('cancelled' as const) : ('saved' as const),
        evidence: null,
      };
    });
    await controller.explain();
    await controller.prepare();
    await controller.export();
    await controller.acknowledge();
    await controller.delete();
    expect(deps.persist).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.cleanup).not.toHaveBeenCalled();
  },
);

test('changed source invalidates exported proof before acknowledgement', async () => {
  const { controller, deps, prepare } = fixture();
  await prepare();
  deps.read = jest.fn(async () => ({
    ...snapshot,
    fingerprint: 'd'.repeat(64),
  }));
  await controller.acknowledge();
  await controller.delete();
  expect(deps.send).not.toHaveBeenCalled();
  expect(deps.persist).not.toHaveBeenCalled();
});

test.each([1, 3])(
  'outstanding local work count %i survives attempted export/delete',
  async (outstanding) => {
    const { controller, deps } = fixture();
    deps.read = jest.fn(async () => ({ ...snapshot, outstanding }));
    await controller.explain();
    await controller.prepare();
    await controller.export();
    await controller.acknowledge();
    await controller.delete();
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.cleanup).not.toHaveBeenCalled();
  },
);

test('relogin detected after export blocks old-session delete', async () => {
  const { controller, deps, confirm } = fixture();
  await confirm();
  deps.guard = jest.fn(async () => {
    throw new Error('new login');
  });
  await controller.delete();
  expect(deps.send).not.toHaveBeenCalled();
  expect(deps.persist).not.toHaveBeenCalled();
});

test('failed durable intent write never shuts down or sends destructive request', async () => {
  const { controller, deps, confirm } = fixture();
  await confirm();
  deps.persist = jest.fn(async () => {
    throw new Error('storage');
  });
  await controller.delete();
  expect(deps.shutdown).not.toHaveBeenCalled();
  expect(deps.send).not.toHaveBeenCalled();
  expect(deps.cleanup).not.toHaveBeenCalled();
});

test('lost server response retains durable intent and local records for recovery', async () => {
  const { controller, deps, confirm } = fixture();
  await confirm();
  deps.send = jest.fn(async () => {
    throw new Error('timeout');
  });
  await controller.delete();
  expect(deps.persist).toHaveBeenCalledTimes(1);
  expect(deps.cleanup).not.toHaveBeenCalled();
  expect(deps.clear).not.toHaveBeenCalled();
  expect(deps.publish).toHaveBeenLastCalledWith(
    'unknown',
    expect.any(Object),
    0,
  );
});

test.each(['prepared', 'database_deleted'] as const)(
  '%s recovery uses exact capability without expired bearer',
  async (status) => {
    const { controller, deps } = fixture(restored);
    deps.send = jest.fn(async (action) =>
      action === 'status' ? status : 'complete',
    );
    await controller.recover();
    expect(deps.send).toHaveBeenNthCalledWith(1, 'status', restored);
    expect(deps.send).toHaveBeenNthCalledWith(2, 'delete', restored, undefined);
    expect(deps.persist).not.toHaveBeenCalled();
    expect(deps.cleanup).toHaveBeenCalledWith(snapshot);
  },
);

test('already complete recovery only verifies and cleans known local cache', async () => {
  const { controller, deps } = fixture(restored);
  await controller.recover();
  expect(deps.send).toHaveBeenCalledTimes(1);
  expect(deps.send).toHaveBeenCalledWith('status', restored);
  expect(deps.clear).toHaveBeenCalledWith(restored);
});

test.each(['changed', 'outstanding', 'storage'] as const)(
  'complete receipt with %s local state retains recovery marker',
  async (mode) => {
    const { controller, deps } = fixture(restored);
    if (mode === 'storage')
      deps.read = jest.fn(async () => {
        throw new Error('unreadable');
      });
    else
      deps.read = jest.fn(async () => ({
        ...snapshot,
        ...(mode === 'changed'
          ? { fingerprint: 'f'.repeat(64) }
          : { outstanding: 1 }),
      }));
    await controller.recover();
    expect(deps.cleanup).not.toHaveBeenCalled();
    expect(deps.clear).not.toHaveBeenCalled();
    expect(deps.publish).toHaveBeenLastCalledWith(
      'cleanupRequired',
      undefined,
      undefined,
    );
  },
);

test('foreign-account recovered intent is never sent or cleared', async () => {
  const { controller, deps } = fixture({ ...restored, accountId: 'foreign' });
  await controller.recover();
  expect(deps.send).not.toHaveBeenCalled();
  expect(deps.clear).not.toHaveBeenCalled();
});

test('dismissal before preparation suppresses file and deletion operations', async () => {
  const { controller, deps } = fixture();
  controller.cancel();
  await controller.explain();
  await controller.prepare();
  await controller.export();
  await controller.delete();
  expect(deps.inspect).not.toHaveBeenCalled();
  expect(deps.file).not.toHaveBeenCalled();
  expect(deps.send).not.toHaveBeenCalled();
});

test('new local work after mutation shutdown prevents destructive send and retains intent', async () => {
  const { controller, deps, confirm } = fixture();
  await confirm();
  deps.shutdown = jest.fn(async () => {
    deps.read = jest.fn(async () => ({ ...snapshot, outstanding: 1 }));
  });
  await controller.delete();
  expect(deps.persist).toHaveBeenCalledTimes(1);
  expect(deps.send).not.toHaveBeenCalled();
  expect(deps.clear).not.toHaveBeenCalled();
});

test('pending recovery does not resume server deletion when local proof changed', async () => {
  const { controller, deps } = fixture(restored);
  deps.send = jest.fn(async () => 'prepared');
  deps.read = jest.fn(async () => ({
    ...snapshot,
    fingerprint: 'd'.repeat(64),
  }));
  await controller.recover();
  expect(deps.send).toHaveBeenCalledTimes(1);
  expect(deps.send).toHaveBeenCalledWith('status', restored);
  expect(deps.cleanup).not.toHaveBeenCalled();
  expect(deps.clear).not.toHaveBeenCalled();
});

test('dismissal while file adapter is pending cannot publish proof or send deletion', async () => {
  const { controller, deps } = fixture();
  const file = deps.file;
  let resolve!: () => void;
  const waiting = new Promise<void>((done) => {
    resolve = done;
  });
  deps.file = jest.fn(async (...parameters) => {
    await waiting;
    return file(...parameters);
  });
  await controller.explain();
  await controller.prepare();
  const exporting = controller.export();
  await Promise.resolve();
  await Promise.resolve();
  controller.stop();
  const publications = jest.mocked(deps.publish).mock.calls.length;
  resolve();
  await exporting;
  await controller.acknowledge();
  await controller.delete();
  expect(deps.publish).toHaveBeenCalledTimes(publications);
  expect(deps.send).not.toHaveBeenCalled();
});

test('double delete while durable write is pending creates only one intent', async () => {
  const { controller, deps, confirm } = fixture();
  await confirm();
  let resolve!: () => void;
  deps.persist = jest.fn(
    async () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const deleting = controller.delete();
  for (let step = 0; step < 15 && !resolve; step += 1) await Promise.resolve();
  expect(deps.persist).toHaveBeenCalledTimes(1);
  await controller.delete();
  resolve();
  await deleting;
  expect(deps.persist).toHaveBeenCalledTimes(1);
  expect(deps.send).toHaveBeenCalledTimes(1);
});

test('production transport sends only server contract fields from durable intent', async () => {
  const transport = jest.fn(async () => ({
    status: 200,
    data: { requestId: restored.requestId, status: 'complete' },
  }));
  await expect(
    sendDeletion('delete', restored, identity.token, transport),
  ).resolves.toBe('complete');
  expect(transport).toHaveBeenCalledWith(
    {
      action: 'delete',
      requestId: restored.requestId,
      recoveryToken: restored.recoveryToken,
    },
    identity.token,
  );
});

test('failed local write fence retains durable intent and prevents server deletion', async () => {
  const { controller, deps, confirm } = fixture();
  await confirm();
  deps.fence = jest.fn(async () => {
    throw new Error('sqlite fence failed');
  });
  await controller.delete();
  expect(deps.persist).toHaveBeenCalledTimes(1);
  expect(deps.fence).toHaveBeenCalledWith(snapshot);
  expect(deps.send).not.toHaveBeenCalled();
  expect(deps.clear).not.toHaveBeenCalled();
});

test('complete recovery permits partially cleaned cache only with exact cleanup marker', async () => {
  const { controller, deps } = fixture(restored);
  deps.read = jest.fn(async () => ({
    ...snapshot,
    fingerprint: 'e'.repeat(64),
  }));
  deps.canResumeCleanup = jest.fn(async () => true);
  await controller.recover();
  expect(deps.canResumeCleanup).toHaveBeenCalledWith(restored.fingerprint);
  expect(deps.cleanup).toHaveBeenCalledWith(
    expect.objectContaining({ fingerprint: 'e'.repeat(64) }),
  );
  expect(deps.clear).toHaveBeenCalledWith(restored);
});

test('partial cleanup marker never authorizes clearing new outstanding work', async () => {
  const { controller, deps } = fixture(restored);
  deps.read = jest.fn(async () => ({
    ...snapshot,
    fingerprint: 'e'.repeat(64),
    outstanding: 1,
  }));
  deps.canResumeCleanup = jest.fn(async () => true);
  await controller.recover();
  expect(deps.cleanup).not.toHaveBeenCalled();
  expect(deps.clear).not.toHaveBeenCalled();
});

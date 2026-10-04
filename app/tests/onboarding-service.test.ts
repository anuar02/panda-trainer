import {
  completeTrainerOnboarding,
  loadOnboardingContext,
} from '@/features/onboarding/service';
import { createTrainerOnboardingDraft } from '@/features/onboarding/welcome-model';
import {
  actor,
  anotherLogin,
  audit,
  card,
  connection,
  deferred,
  profile,
  session,
  setupOnboarding,
  workspace,
  workspaceId,
} from './onboarding-fixtures';

jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
const scope = () => ({ userId: actor, token: session().access_token });
const draft = () => ({
  ...createTrainerOnboardingDraft('Synthetic trainer'),
  clientName: 'Optional client',
  clientPhone: '+7 000',
});
afterEach(() => jest.resetAllMocks());

test('first trainer, returning trainer and client-only/multiple connections are real scoped contexts', async () => {
  const first = setupOnboarding({ first: true });
  expect(await loadOnboardingContext(scope())).toEqual({
    userId: actor,
    profile: null,
    workspace: null,
    connections: [],
  });
  const result = await completeTrainerOnboarding(draft(), scope());
  expect(result.workspace?.id).toBe(workspaceId);
  expect(result.profile?.display_name).toBe(profile.display_name);
  await completeTrainerOnboarding(draft(), scope());
  expect(first.creations()).toBe(1);
  const rpc = first.calls.find(
    (c) => c.label === 'complete_trainer_onboarding',
  );
  expect(rpc?.args).toMatchObject({
    first_client_name: 'Optional client',
    first_client_phone: '+7 000',
  });
  expect(JSON.stringify(rpc?.args)).not.toContain(session().access_token);
  for (const call of first.calls.filter((c) => c.label !== 'getSession'))
    expect(call.token).toBe(
      call.label === 'getUser'
        ? session().access_token
        : `Bearer ${session().access_token}`,
    );
  const client = setupOnboarding({ connections: true });
  client.tables.trainer_workspaces = [];
  client.tables.client_records?.push({
    ...card,
    id: anotherLogin,
    workspace_id: anotherLogin,
  });
  client.setConnections([
    connection,
    {
      ...connection,
      client_record_id: anotherLogin,
      workspace_id: anotherLogin,
    },
  ]);
  expect((await loadOnboardingContext(scope())).connections).toHaveLength(2);
  expect(client.subscriptions()).toBe(0);
});

test.each(['load', 'complete'] as const)(
  'same-user relogin fails closed at every %s I/O await',
  async (operation) => {
    const baseline = setupOnboarding();
    const run = () =>
      operation === 'load'
        ? loadOnboardingContext(scope())
        : completeTrainerOnboarding(draft(), scope());
    await run();
    const count = baseline.calls.length;
    expect(count).toBeGreaterThan(10);
    for (let checkpoint = 1; checkpoint <= count; checkpoint++) {
      let seen = 0;
      const ready = deferred<void>();
      const release = deferred<void>();
      const read = setupOnboarding({
        io: async () => {
          if (++seen === checkpoint) {
            ready.resolve();
            await release.promise;
          }
        },
      });
      const result = run();
      const rejection = expect(result).rejects.toThrow(
        'Onboarding unavailable',
      );
      await ready.promise;
      read.emit('SIGNED_IN', session(anotherLogin));
      release.resolve();
      await rejection;
      expect(read.subscriptions()).toBe(0);
    }
  },
);

test.each(['SIGNED_OUT', 'SIGNED_IN', 'TOKEN_REFRESHED'] as const)(
  'identity-changing %s while RPC pending rejects success and sanitizes errors',
  async (event) => {
    const ready = deferred<void>();
    const release = deferred<void>();
    const read = setupOnboarding({
      io: async (c) => {
        if (c.label === 'complete_trainer_onboarding') {
          ready.resolve();
          await release.promise;
          throw new Error(session().access_token);
        }
      },
    });
    const result = completeTrainerOnboarding(draft(), scope());
    const rejection = expect(result).rejects.toThrow('Onboarding unavailable');
    await ready.promise;
    read.emit(event, event === 'SIGNED_OUT' ? null : session(anotherLogin));
    release.resolve();
    await rejection;
    expect(read.subscriptions()).toBe(0);
  },
);

test('verified refresh of the same identity is allowed and transport retains captured bearer', async () => {
  let refreshed = false;
  const read = setupOnboarding({
    io: (c) => {
      if (c.label === 'getUser' && !refreshed) {
        refreshed = true;
        read.emit('TOKEN_REFRESHED', session(undefined, actor, 'refresh'));
      }
    },
  });
  expect(
    (await completeTrainerOnboarding(draft(), scope())).workspace?.id,
  ).toBe(workspaceId);
  expect(
    read.calls
      .filter((c) => c.token)
      .every((c) => c.token?.includes(session().access_token)),
  ).toBe(true);
});

test('silent token changes, foreign actor, aborted lifecycle and wrong server user fail closed', async () => {
  const read = setupOnboarding();
  read.setSession(session(anotherLogin));
  await expect(loadOnboardingContext(scope())).rejects.toThrow(
    'Onboarding unavailable',
  );
  const abort = new AbortController();
  abort.abort();
  await expect(
    loadOnboardingContext({ ...scope(), signal: abort.signal }),
  ).rejects.toThrow('Onboarding unavailable');
  expect(read.calls).toHaveLength(1);
  setupOnboarding({
    io: (c) => {
      if (c.label === 'getUser') throw new Error('private backend details');
    },
  });
  await expect(loadOnboardingContext(scope())).rejects.toThrow(
    'Onboarding unavailable',
  );
  let silent = false;
  const next = setupOnboarding({
    io: (c) => {
      if (c.label === 'getUser' && !silent) {
        silent = true;
        next.setSession(session(undefined, actor, 'unverified'));
      }
    },
  });
  await expect(loadOnboardingContext(scope())).rejects.toThrow(
    'Onboarding unavailable',
  );
});

test.each([
  ['profiles', { ...profile, user_id: anotherLogin }],
  ['profiles', { ...profile, display_name: '\u202eunsafe' }],
  ['profiles', { ...profile, created_by: 'bad' }],
  ['profiles', { ...profile, revision: 0 }],
  ['profiles', { ...profile, updated_at: '2026-02-30T10:00:00Z' }],
  ['profiles', { ...profile, locale: null }],
  ['trainer_workspaces', { ...workspace, owner_user_id: anotherLogin }],
  ['trainer_workspaces', { ...workspace, id: 'invalid' }],
  ['trainer_workspaces', { ...workspace, timezone: 'invalid' }],
  ['trainer_workspaces', { ...workspace, day_start: '22:00:00' }],
  ['trainer_workspaces', { ...workspace, working_days: [] }],
  ['trainer_workspaces', { ...workspace, training_focus: [null] }],
  ['client_records', { ...card, user_id: anotherLogin }],
  ['client_records', { ...card, archived_at: audit.created_at }],
  ['client_records', { ...card, workspace_id: anotherLogin }],
  ['client_records', { ...card, phone: {} }],
  ['client_records', { ...card, display_name: 'wrong snapshot' }],
] as [string, unknown][])(
  'rejects malformed or foreign %s rows',
  async (table, row) => {
    const read = setupOnboarding({ connections: true });
    read.tables[table] = [row];
    await expect(loadOnboardingContext(scope())).rejects.toThrow(
      'Onboarding unavailable',
    );
  },
);

test.each([
  null,
  {},
  [connection, connection],
  [{ ...connection, trainer_name: '\u0000' }],
  [],
  [{ ...connection, workspace_id: anotherLogin }],
])(
  'rejects invalid/missing/foreign connection projection %#',
  async (value) => {
    const read = setupOnboarding({ connections: true });
    read.setConnections(value);
    await expect(loadOnboardingContext(scope())).rejects.toThrow(
      'Onboarding unavailable',
    );
  },
);

test('unknown RPC/lost response can replay atomic onboarding; mismatched workspace never succeeds', async () => {
  const read = setupOnboarding({ first: true });
  read.setResult(null);
  await expect(completeTrainerOnboarding(draft(), scope())).rejects.toThrow(
    'Onboarding unavailable',
  );
  expect(read.creations()).toBe(1);
  read.setResult(undefined);
  expect(
    (await completeTrainerOnboarding(draft(), scope())).workspace?.id,
  ).toBe(workspaceId);
  expect(read.creations()).toBe(1);
  read.setResult({ ...workspace, id: anotherLogin });
  await expect(completeTrainerOnboarding(draft(), scope())).rejects.toThrow(
    'Onboarding unavailable',
  );
});

test('null projections, false empty, truncated count and inconsistent profile fail closed', async () => {
  const read = setupOnboarding();
  read.tables.profiles = [];
  await expect(loadOnboardingContext(scope())).rejects.toThrow(
    'Onboarding unavailable',
  );
  const missing = setupOnboarding({ connections: true });
  missing.setCount(2);
  await expect(loadOnboardingContext(scope())).rejects.toThrow(
    'Onboarding unavailable',
  );
});

test.each([
  { name: '' },
  { name: 'x'.repeat(121) },
  { days: [] },
  { days: [7] },
  { focus: ['unknown'] },
  { from: '22:00' },
  { length: 75 },
  { clientName: '', clientPhone: '123' },
])('invalid draft %# performs no I/O', async (patch) => {
  const read = setupOnboarding();
  await expect(
    completeTrainerOnboarding({ ...draft(), ...patch }, scope()),
  ).rejects.toThrow('Onboarding unavailable');
  expect(read.calls).toHaveLength(0);
});

test('client-only connections do not need a fabricated profile; bounded pages never drop connections', async () => {
  const read = setupOnboarding({ connections: true });
  read.tables.profiles = [];
  read.tables.trainer_workspaces = [];
  expect((await loadOnboardingContext(scope())).profile).toBeNull();
  read.tables.client_records = Array.from({ length: 201 }, (_, i) => ({
    ...card,
    id: `72000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  }));
  read.setConnections(
    read.tables.client_records.map((value) => ({
      ...connection,
      client_record_id: (value as typeof card).id,
    })),
  );
  expect((await loadOnboardingContext(scope())).connections).toHaveLength(201);
  read.setCount(10001);
  await expect(loadOnboardingContext(scope())).rejects.toThrow(
    'Onboarding unavailable',
  );
});

test.each(['null', 'foreign', 'invalid-sub'])(
  'expected session %s cannot access data',
  async (kind) => {
    const read = setupOnboarding();
    const token =
      kind === 'invalid-sub'
        ? `header.${Buffer.from(JSON.stringify({ sub: anotherLogin, session_id: anotherLogin })).toString('base64url')}.signature`
        : session(anotherLogin, anotherLogin).access_token;
    if (kind === 'null') read.setSession(null);
    await expect(
      loadOnboardingContext({ userId: actor, token }),
    ).rejects.toThrow('Onboarding unavailable');
    expect(read.calls.filter((c) => c.label !== 'getSession')).toHaveLength(0);
  },
);

test('SIGNED_IN even with identical credentials invalidates the old generation', async () => {
  const ready = deferred<void>();
  const release = deferred<void>();
  const read = setupOnboarding({
    io: async (io) => {
      if (io.label === 'getUser') {
        ready.resolve();
        await release.promise;
      }
    },
  });
  const result = loadOnboardingContext(scope());
  const rejected = expect(result).rejects.toThrow('Onboarding unavailable');
  await ready.promise;
  read.emit('SIGNED_IN', session());
  release.resolve();
  await rejected;
});

test.each(Array.from({ length: 18 }, (_, index) => index + 1))(
  'verified same-identity refresh at completion I/O %i accepts old getSession snapshots',
  async (checkpoint) => {
    let seen = 0;
    const read = setupOnboarding({
      io: () => {
        if (++seen === checkpoint)
          read.emit('TOKEN_REFRESHED', session(undefined, actor, 'refresh'));
      },
    });
    expect(
      (await completeTrainerOnboarding(draft(), scope())).workspace?.id,
    ).toBe(workspaceId);
    expect(read.subscriptions()).toBe(0);
  },
);

test('caller mutation during first await cannot replace captured identity or credentials', async () => {
  const request = scope();
  const read = setupOnboarding({
    io: (io) => {
      if (io.label === 'getSession') {
        request.userId = anotherLogin;
        request.token = session(anotherLogin, anotherLogin).access_token;
      }
    },
  });
  expect((await loadOnboardingContext(request)).userId).toBe(actor);
  expect(
    read.calls
      .filter((io) => io.token)
      .every((io) => io.token?.includes(session().access_token)),
  ).toBe(true);
});

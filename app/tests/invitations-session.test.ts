import * as Crypto from 'expo-crypto';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  acceptInvitation,
  createIssueClientInvitationOperation,
  createRevokeClientInvitationOperation,
} from '../src/features/invitations/service';
import { loadTrainerInvitation } from '../src/features/invitations/read';
import {
  accepted,
  actor,
  cardId,
  deferred,
  harness,
  invitationId,
  issued,
  jwt,
  scope,
  secret,
  session,
  workspace,
} from './invitation-harness';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
  randomUUID: jest.fn(),
}));
const getClient = jest.mocked(getSupabaseClient);
const random = jest.mocked(Crypto.getRandomBytesAsync);
const issue = () =>
  createIssueClientInvitationOperation(
    cardId,
    'https://trainer.narutouzumaki.kz',
    scope,
  );
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i += 1) await tick();
  expect(check()).toBe(true);
}

beforeEach(() => {
  random
    .mockReset()
    .mockResolvedValue(Uint8Array.from({ length: 32 }, (_, i) => i));
  jest.mocked(Crypto.randomUUID).mockReturnValue(invitationId);
});

it.each(['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'])(
  'fences %s while random is pending and never sends the token',
  async (event) => {
    const h = harness();
    getClient.mockReturnValue(h.client);
    const bytes = deferred<Uint8Array>();
    random.mockReturnValue(bytes.promise);
    const creating = issue();
    const rejected = expect(creating).rejects.toThrow();
    await until(() => random.mock.calls.length === 1);
    h.event(event, event === 'SIGNED_OUT' ? null : session(actor, workspace));
    bytes.resolve(new Uint8Array(32));
    await rejected;
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
  },
);

it('captures caller identity before auth/random awaits instead of adopting a new login', async () => {
  const h = harness();
  getClient.mockReturnValue(h.client);
  h.setSession(session(actor, workspace));
  await expect(issue()).rejects.toThrow();
  expect(random).not.toHaveBeenCalled();
});

it.each(['issue', 'revoke', 'accept'] as const)(
  'discards late %s success and private errors after same-user relogin',
  async (kind) => {
    for (const fails of [false, true]) {
      const response = deferred<{ data: unknown; error: unknown }>();
      const h = harness(jest.fn(() => response.promise));
      getClient.mockReturnValue(h.client);
      const op =
        kind === 'issue'
          ? await issue()
          : kind === 'revoke'
            ? createRevokeClientInvitationOperation(invitationId, scope)
            : null;
      const running = op ? op.execute() : acceptInvitation(secret, scope);
      const rejected = expect(running).rejects.toThrow();
      await until(() => h.rpc.mock.calls.length === 1);
      h.event('SIGNED_IN', session(actor, workspace));
      if (fails) response.reject(new Error(`private ${secret}`));
      else
        response.resolve({
          data:
            kind === 'issue'
              ? issued
              : kind === 'revoke'
                ? {
                    invitation_id: invitationId,
                    revoked: true,
                    replayed: false,
                  }
                : accepted,
          error: null,
        });
      await rejected;
      op?.dispose();
    }
  },
);

it('never returns a successful cache to logout, a switched actor, or a same-user new session', async () => {
  for (const next of [
    null,
    session(workspace),
    session(actor, workspace),
    session(),
  ]) {
    const h = harness(
      jest.fn().mockResolvedValue({ data: issued, error: null }),
    );
    getClient.mockReturnValue(h.client);
    const op = await issue();
    await op.execute();
    h.event(next ? 'SIGNED_IN' : 'SIGNED_OUT', next);
    await expect(op.execute()).rejects.toThrow();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    op.dispose();
  }
});

it('permits only a verified refresh of the same JWT subject/session and uses an explicit bearer', async () => {
  const h = harness(jest.fn().mockResolvedValue({ data: issued, error: null }));
  getClient.mockReturnValue(h.client);
  const op = await issue();
  const refresh = session(actor, invitationId, 'refresh');
  h.event('TOKEN_REFRESHED', refresh);
  await op.execute();
  expect(
    h.headers.filter((x) => x.source === 'issue_client_invitation'),
  ).toEqual([
    {
      source: 'issue_client_invitation',
      name: 'Authorization',
      value: `Bearer ${refresh.access_token}`,
    },
  ]);
  expect(h.getUser).toHaveBeenLastCalledWith(refresh.access_token);
  op.dispose();
});

it.each(['silent', 'wrong-sub', 'wrong-session'] as const)(
  'rejects %s credential changes',
  async (kind) => {
    const h = harness();
    getClient.mockReturnValue(h.client);
    const op = await issue();
    if (kind === 'silent')
      h.setSession(session(actor, invitationId, 'unverified'));
    else
      h.event(
        'TOKEN_REFRESHED',
        kind === 'wrong-sub'
          ? { user: { id: actor }, access_token: jwt(workspace) }
          : session(actor, workspace),
      );
    await expect(op.execute()).rejects.toThrow();
    expect(h.rpc).not.toHaveBeenCalled();
    op.dispose();
  },
);

it('verifies the actor with Auth and rejects malformed expected JWT before network/random', async () => {
  const h = harness();
  getClient.mockReturnValue(h.client);
  await expect(
    createIssueClientInvitationOperation(
      cardId,
      'https://trainer.narutouzumaki.kz',
      { ...scope, token: jwt(workspace) },
    ),
  ).rejects.toThrow();
  expect(h.getSession).not.toHaveBeenCalled();
  expect(random).not.toHaveBeenCalled();
  h.getUser.mockResolvedValue({
    data: { user: { id: workspace } },
    error: null,
  });
  await expect(issue()).rejects.toThrow();
  expect(random).not.toHaveBeenCalled();
});

it.each(['owner', 'card', 'invitation'] as const)(
  'rejects a mismatched %s scope before mutation',
  async (kind) => {
    const h = harness();
    getClient.mockReturnValue(h.client);
    h.read.mockImplementation(async (table) => ({
      data:
        table === 'trainer_workspaces'
          ? {
              id: workspace,
              owner_user_id: kind === 'owner' ? workspace : actor,
            }
          : table === 'client_records'
            ? { ...h.card, id: kind === 'card' ? workspace : cardId }
            : { ...h.invitation, client_record_id: workspace },
      error: null,
    }));
    if (kind === 'invitation') {
      const op = createRevokeClientInvitationOperation(invitationId, scope);
      await expect(op.execute()).rejects.toThrow();
      op.dispose();
    } else await expect(issue()).rejects.toThrow();
    expect(h.rpc).not.toHaveBeenCalled();
  },
);

it('keeps exact issue/revoke payloads on lost responses and coalesces double taps', async () => {
  for (const kind of ['issue', 'revoke']) {
    const result =
      kind === 'issue'
        ? issued
        : { invitation_id: invitationId, revoked: true, replayed: true };
    const h = harness(
      jest
        .fn()
        .mockRejectedValueOnce(new Error('lost'))
        .mockResolvedValue({ data: result, error: null }),
    );
    getClient.mockReturnValue(h.client);
    const op =
      kind === 'issue'
        ? await issue()
        : createRevokeClientInvitationOperation(invitationId, scope);
    await expect(op.execute()).rejects.toThrow();
    await Promise.all([op.execute(), op.execute()]);
    expect(h.rpc).toHaveBeenCalledTimes(2);
    expect(h.rpc.mock.calls[0]).toEqual(h.rpc.mock.calls[1]);
    op.dispose();
  }
});

it('retries acceptance with the same bearer intent using the server replay without creating a new card', async () => {
  const h = harness(
    jest
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValue({
        data: { ...accepted, replayed: true },
        error: null,
      }),
  );
  getClient.mockReturnValue(h.client);
  await expect(acceptInvitation(secret, scope)).rejects.toThrow();
  await expect(acceptInvitation(secret, scope)).resolves.toMatchObject({
    clientRecordId: cardId,
    replayed: true,
  });
  expect(h.rpc.mock.calls[0]).toEqual(h.rpc.mock.calls[1]);
  expect(h.listeners.size).toBe(0);
});

it.each([
  '2026-02-30T12:00:00Z',
  '2026-10-01',
  '2026-10-01T12:00:00+06:00',
  '2026-10-01T25:00:00Z',
])(
  'rejects malformed/non-UTC date %s without treating it as a terminal claim failure',
  async (date) => {
    const h = harness(
      jest.fn().mockResolvedValue({
        data: { ...accepted, accepted_at: date },
        error: null,
      }),
    );
    getClient.mockReturnValue(h.client);
    await expect(acceptInvitation(secret, scope)).rejects.toMatchObject({
      code: 'request',
    });
    h.rpc.mockResolvedValue({
      data: { ...issued, expires_at: date },
      error: null,
    });
    const op = await issue();
    await expect(op.execute()).rejects.toMatchObject({ code: 'request' });
    op.dispose();
  },
);

it('validates own bounded invitation rows and keeps the explicit scope on every read', async () => {
  const h = harness();
  getClient.mockReturnValue(h.client);
  await expect(loadTrainerInvitation(scope)).resolves.toMatchObject({
    client: { id: cardId },
    invitation: { id: invitationId },
  });
  expect(
    h.headers.every(
      (x) => x.name === 'Authorization' && x.value === `Bearer ${scope.token}`,
    ),
  ).toBe(true);
  expect(h.queries.find((x) => x.source === 'invitations')?.calls).toEqual(
    expect.arrayContaining([
      ['limit', [1]],
      ['eq', ['client_record_id', cardId]],
    ]),
  );
});

it.each(['client', 'invitation', 'date'] as const)(
  'rejects malformed invitation read %s instead of displaying another row',
  async (kind) => {
    const h = harness();
    getClient.mockReturnValue(h.client);
    h.read.mockImplementation(async (table) => ({
      data:
        table === 'trainer_workspaces'
          ? { id: workspace, owner_user_id: actor }
          : table === 'client_records'
            ? { ...h.card, id: kind === 'client' ? workspace : cardId }
            : {
                ...h.invitation,
                client_record_id: kind === 'invitation' ? actor : cardId,
                expires_at: kind === 'date' ? 'yesterday' : issued.expires_at,
              },
      error: null,
    }));
    await expect(loadTrainerInvitation(scope)).rejects.toThrow();
  },
);

it('fences late read failures and aborts on caller workspace/unmount invalidation', async () => {
  const wait = deferred<{ data: unknown; error: unknown }>();
  const h = harness();
  getClient.mockReturnValue(h.client);
  h.read.mockReturnValue(wait.promise);
  const abort = new AbortController();
  const loading = loadTrainerInvitation({ ...scope, signal: abort.signal });
  const rejected = expect(loading).rejects.toThrow();
  await until(() => h.read.mock.calls.length === 1);
  abort.abort();
  wait.reject(new Error(`private ${secret}`));
  await rejected;
  expect(h.listeners.size).toBe(0);
});

it.each(['user-verification', 'ownership-read', 'guard'] as const)(
  'does not adopt a new actor during the %s await',
  async (stage) => {
    const h = harness();
    getClient.mockReturnValue(h.client);
    const wait = deferred<unknown>();
    if (stage === 'user-verification')
      h.getUser.mockImplementationOnce(async () => {
        await wait.promise;
        return { data: { user: { id: actor } }, error: null };
      });
    else if (stage === 'ownership-read')
      h.read.mockImplementationOnce(async () => {
        await wait.promise;
        return { data: { id: workspace, owner_user_id: actor }, error: null };
      });
    else
      h.getSession.mockImplementationOnce(async () => {
        await wait.promise;
        return { data: { session: session() }, error: null };
      });
    const creating = issue();
    const rejected = expect(creating).rejects.toThrow();
    for (let i = 0; i < 5; i += 1) await tick();
    h.event('SIGNED_IN', session(workspace));
    wait.resolve(undefined);
    await rejected;
    expect(h.rpc).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  },
);

it.each([
  null,
  [],
  { ...accepted, trainer_name: 'x'.repeat(121) },
  { ...accepted, trainer_name: 'Trainer\nSecret' },
  { ...accepted, replayed: 'true' },
  { ...accepted, client_record_id: 'wrong' },
])(
  'rejects malformed acceptance result without exposing server input',
  async (data) => {
    const h = harness(jest.fn().mockResolvedValue({ data, error: null }));
    getClient.mockReturnValue(h.client);
    await expect(acceptInvitation(secret, scope)).rejects.toMatchObject({
      code: 'request',
      message: 'Invitation request could not be completed',
    });
  },
);

it.each(['random', 'verify'] as const)(
  'guards rejected %s awaits before returning an error to a changed caller',
  async (stage) => {
    const h = harness();
    getClient.mockReturnValue(h.client);
    const wait = deferred<Uint8Array>();
    if (stage === 'random') random.mockReturnValueOnce(wait.promise);
    else
      h.getUser.mockImplementationOnce(async () => {
        await wait.promise;
        return { data: { user: { id: actor } }, error: null };
      });
    const creating = issue();
    const rejected = expect(creating).rejects.toMatchObject({
      name: 'InvitationSessionError',
    });
    await until(() =>
      stage === 'random'
        ? random.mock.calls.length === 1
        : h.getUser.mock.calls.length === 1,
    );
    h.setSession(session(actor, workspace));
    wait.reject(new Error(`private ${secret}`));
    await rejected;
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
  },
);

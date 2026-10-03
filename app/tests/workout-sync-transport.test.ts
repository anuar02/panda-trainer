import { createWorkoutSyncTransport } from '../src/features/workout-sync/transport';
import { operation, receipt, response, session } from './workout-sync-fixtures';

function fetchResponse(body: unknown, status = 200): typeof fetch {
  return async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as Response;
}
const config = {
  url: 'https://synthetic.invalid',
  anonKey: 'synthetic-public-key',
};

describe('workout RPC transport boundary', () => {
  test('sends explicit bearer, scope, stable operations and abort signal', async () => {
    const item = operation('op-a');
    const signal = new AbortController().signal;
    let request: RequestInit | undefined;
    let endpoint: string | URL | Request | undefined;
    const fetcher: typeof fetch = async (url, init) => {
      endpoint = url;
      request = init;
      return fetchResponse(response([receipt(item)]))(url, init);
    };
    const result = await createWorkoutSyncTransport({
      ...config,
      fetch: fetcher,
    }).apply(session, [item], signal);
    expect(String(endpoint)).toBe(`${config.url}/rest/v1/rpc/apply_operations`);
    expect(request?.method).toBe('POST');
    expect(new Headers(request?.headers).get('Authorization')).toBe(
      `Bearer ${session.accessToken}`,
    );
    expect(new Headers(request?.headers).get('apikey')).toBe(config.anonKey);
    expect(request?.signal).toBe(signal);
    expect(JSON.parse(String(request?.body))).toEqual({
      p_workspace_id: session.workspaceId,
      p_operations: [item],
    });
    expect(result).toEqual(response([receipt(item)]));
  });
  test.each([
    null,
    {},
    {
      account_id: session.accountId,
      workspace_id: session.workspaceId,
      results: [],
    },
    response([receipt(operation('foreign'))]),
    response([{ ...receipt(operation('op-a')), entity_id: 'foreign' }]),
    response([receipt(operation('op-a')), receipt(operation('op-a'))]),
    response([
      {
        ...receipt(operation('op-a')),
        status: 'unknown',
      } as unknown as ReturnType<typeof receipt>,
    ]),
    response([{ ...receipt(operation('op-a')), revision: -1 }]),
    response([{ ...receipt(operation('op-a')), revision: null }]),
    response([{ ...receipt(operation('op-a')), revision: 1.5 }]),
    response([receipt(operation('op-a'))], {
      accountId: 'foreign',
      workspaceId: session.workspaceId,
    }),
    response([receipt(operation('op-a'))], {
      accountId: session.accountId,
      workspaceId: 'foreign',
    }),
  ])('rejects malformed or foreign receipts %#', async (body) => {
    await expect(
      createWorkoutSyncTransport({
        ...config,
        fetch: fetchResponse(body),
      }).apply(session, [operation('op-a')], new AbortController().signal),
    ).rejects.toThrow();
  });
  test.each([401, 403, 500])(
    'rejects HTTP %i even with valid receipt JSON',
    async (status) => {
      await expect(
        createWorkoutSyncTransport({
          ...config,
          fetch: fetchResponse(response([receipt(operation('op-a'))]), status),
        }).apply(session, [operation('op-a')], new AbortController().signal),
      ).rejects.toThrow();
    },
  );
  test('rejects unreadable JSON', async () => {
    const fetcher: typeof fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('invalid json');
        },
      }) as unknown as Response;
    await expect(
      createWorkoutSyncTransport({ ...config, fetch: fetcher }).apply(
        session,
        [operation('op-a')],
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
});

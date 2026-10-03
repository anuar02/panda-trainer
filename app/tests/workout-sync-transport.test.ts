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
  test('preserves the frozen resolve conflict envelope and payload exactly', async () => {
    const item = {
      ...operation('resolve-a'),
      kind: 'resolve_conflict' as const,
      payload: {
        conflict_id: 'conflict-a',
        selected_version: 'incoming',
        expected_revision: 7,
      },
    };
    let body: unknown;
    const fetcher: typeof fetch = async (url, init) => {
      body = JSON.parse(String(init?.body));
      return fetchResponse(response([receipt(item)]))(url, init);
    };
    await createWorkoutSyncTransport({
      ...config,
      url: `${config.url}/`,
      fetch: fetcher,
    }).apply(session, [item], new AbortController().signal);
    expect(body).toEqual({
      p_workspace_id: session.workspaceId,
      p_operations: [item],
    });
  });

  test.each([
    'missing token',
    'missing session',
    'empty batch',
    'oversized batch',
  ])('rejects %s before issuing a request', async (variant) => {
    const fetcher = jest.fn(
      fetchResponse(response([receipt(operation('op-a'))])),
    );
    const owner = {
      ...session,
      ...(variant === 'missing token' ? { accessToken: '' } : {}),
      ...(variant === 'missing session' ? { sessionId: '' } : {}),
    };
    const items =
      variant === 'empty batch'
        ? []
        : variant === 'oversized batch'
          ? Array.from({ length: 101 }, (_, index) => operation(`op-${index}`))
          : [operation('op-a')];
    await expect(
      createWorkoutSyncTransport({ ...config, fetch: fetcher }).apply(
        owner,
        items,
        new AbortController().signal,
      ),
    ).rejects.toThrow('invalid_request');
    expect(fetcher).not.toHaveBeenCalled();
  });

  test.each([
    { ...response([receipt(operation('op-a'))]), unexpected: true },
    response([
      {
        ...receipt(operation('op-a')),
        unexpected: true,
      } as unknown as ReturnType<typeof receipt>,
    ]),
    response([
      { ...receipt(operation('op-a'), 'conflict'), conflict_id: undefined },
    ]),
    response([
      {
        ...receipt(operation('op-a'), 'correction_draft'),
        draft_id: undefined,
      },
    ]),
    response([
      { ...receipt(operation('op-a'), 'error'), error_code: undefined },
    ]),
    response([
      { ...receipt(operation('op-a')), revision: Number.MAX_SAFE_INTEGER + 1 },
    ]),
  ])(
    'rejects unsupported envelope fields or incomplete terminal outcomes %#',
    async (body) => {
      await expect(
        createWorkoutSyncTransport({
          ...config,
          fetch: fetchResponse(body),
        }).apply(session, [operation('op-a')], new AbortController().signal),
      ).rejects.toThrow('invalid_response');
    },
  );
});

import { createCorrectionTransport } from '@/features/workout-corrections/service';
import type { SyncSession } from '@/domain/workout-sync/types';

jest.mock('@/features/auth/client', () => ({ getSupabaseClient: () => null }));

const id = (n: number) =>
  `51000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session: SyncSession = {
  accountId: id(1),
  workspaceId: id(2),
  sessionId: id(3),
  accessToken: 'initial',
};
const command = {
  draftId: id(5),
  requestId: id(6),
  expectedWorkoutRevision: 2,
  expectedEntityRevision: 0,
  expectedExerciseRevision: null,
};
const scope = { account_id: id(1), workspace_id: id(2), workout_id: id(4) };
const finished = '2026-10-04T10:00:00Z';
const operation = {
  operation_id: id(7),
  kind: 'set_note',
  entity_id: id(8),
  device_id: id(9),
  base_revision: 0,
  created_at: finished,
  payload: {
    workout_instance_id: id(4),
    text: 'Synthetic shared note',
    shared: true,
  },
};
const review = {
  ...scope,
  draft_id: id(5),
  operation,
  finished_at: finished,
  applied_at: null,
  applied_request_id: null,
  receipt: null,
  workout_revision: 2,
  entity_revision: 0,
  exercise_revision: null,
  current_version: { entity: null, exercise: null, sets: [], replacements: [] },
  conflict: null,
};
const receipt = {
  ...scope,
  draft_id: id(5),
  request_id: id(6),
  status: 'applied',
  revision: 3,
  entity_revision: 1,
  finished_at: finished,
};
const response = (value: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, json: async () => value }) as Response;
function fixture() {
  let current: SyncSession | null = session;
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const token = jest.fn(async () => 'refreshed');
  const fence = { token, valid: () => true, dispose: jest.fn() };
  const transport = createCorrectionTransport({
    session,
    getSession: () => current,
    workoutId: id(4),
    url: 'https://synthetic.example.test/',
    anonKey: 'synthetic',
    fetch: fetcher,
    fence,
  });
  return {
    transport,
    fetcher,
    token,
    setSession: (next: SyncSession | null) => {
      current = next;
    },
  };
}
test('review only reads and apply sends actor scope and immutable revisions', async () => {
  const { transport, fetcher } = fixture();
  fetcher
    .mockResolvedValueOnce(response(review))
    .mockResolvedValueOnce(response(receipt));
  expect(await transport.review(id(5))).toEqual(review);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toMatch(/get_workout_correction$/);
  expect(await transport.apply(command)).toMatchObject(receipt);
  const init = fetcher.mock.calls[1]?.[1];
  expect(init?.headers).toMatchObject({ Authorization: 'Bearer refreshed' });
  expect(JSON.parse(String(init?.body))).toEqual({
    p_actor_id: id(1),
    p_workspace_id: id(2),
    p_workout_id: id(4),
    p_draft_id: id(5),
    p_request_id: id(6),
    p_expected_workout_revision: 2,
    p_expected_entity_revision: 0,
    p_expected_exercise_revision: null,
  });
});
test.each([
  { ...receipt, account_id: id(99) },
  { ...receipt, workspace_id: id(99) },
  { ...receipt, workout_id: id(99) },
  { ...receipt, request_id: id(99) },
  { ...receipt, draft_id: id(99) },
  { ...receipt, revision: 2 },
  { ...receipt, revision: 3.5 },
  { ...receipt, status: 'correction_draft' },
  { ...receipt, finished_at: null },
])(
  'rejects mismatched or malformed confirmation receipt: %p',
  async (value) => {
    const { transport, fetcher } = fixture();
    fetcher.mockResolvedValue(response(value));
    await expect(transport.apply(command)).rejects.toThrow(
      'correction_response',
    );
  },
);
test.each([
  {
    ...review,
    operation: {
      ...operation,
      payload: { ...operation.payload, shared: null },
    },
  },
  { ...review, operation: { ...operation, kind: 'finish_workout' } },
  {
    ...review,
    current_version: {
      entity: null,
      exercise: null,
      sets: [{ id: id(10), workspace_id: id(99) }],
      replacements: [],
    },
  },
  { ...review, entity_revision: -1 },
])('rejects malformed review before confirmation: %p', async (value) => {
  const { transport, fetcher } = fixture();
  fetcher.mockResolvedValue(response(value));
  await expect(transport.review(id(5))).rejects.toThrow('correction_response');
});
test('same account relogin fences a late result', async () => {
  const { transport, fetcher, setSession } = fixture();
  fetcher.mockImplementation(async () => {
    setSession({ ...session, sessionId: id(99) });
    return response(receipt);
  });
  await expect(transport.apply(command)).rejects.toThrow(
    'correction_session_changed',
  );
});
test('participant switch fences late network error and blocks further requests', async () => {
  const { transport, fetcher, setSession } = fixture();
  fetcher.mockImplementation(async () => {
    setSession({ ...session, accountId: id(99) });
    throw new Error('secret raw network diagnostic');
  });
  await expect(transport.apply(command)).rejects.toThrow(
    'correction_session_changed',
  );
  await expect(transport.apply(command)).rejects.toThrow(
    'correction_session_changed',
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test('lost response retries identical request ID and revision tokens', async () => {
  const { transport, fetcher } = fixture();
  fetcher
    .mockRejectedValueOnce(new Error('lost response'))
    .mockResolvedValueOnce(response(receipt));
  await expect(transport.apply(command)).rejects.toThrow('correction_request');
  await expect(transport.apply(command)).resolves.toMatchObject(receipt);
  expect(fetcher.mock.calls[0]?.[1]?.body).toEqual(
    fetcher.mock.calls[1]?.[1]?.body,
  );
});
test('stale correction cannot be interpreted as applied', async () => {
  const { transport, fetcher } = fixture();
  fetcher.mockResolvedValue(
    response({ code: '22023', message: 'stale_correction' }, 400),
  );
  await expect(transport.apply(command)).rejects.toThrow('correction_stale');
});

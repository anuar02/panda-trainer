import { createServerContextReader } from '@/features/account-export/server-context';
import { collectAccountExport } from '@/features/account-export/collector';
import { parseAccountExport } from '@/domain/account-export';
import snapshot from './snapshot.json';
const scope = {
  accountId: snapshot.owner_user_id,
  workspaceId: snapshot.workspace_id,
  sessionId: 'synthetic',
};
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const note = {
  ...snapshot.collections.private_notes[0]!,
  workout_instance_id: snapshot.collections.workout_instances[0]!.id,
};
const operation = {
  operation_id: id(10),
  entity_id: note.id,
  device_id: id(11),
  base_revision: 1,
  created_at: snapshot.exported_at,
  kind: 'set_note',
  payload: {
    workout_instance_id: note.workout_instance_id,
    text: 'Synthetic incoming note',
    shared: false,
  },
};
function context(correction = false, hung = false, count = 1, cap = 100) {
  const conflict = {
    id: id(12),
    workspace_id: scope.workspaceId,
    workout_instance_id: note.workout_instance_id,
    entity_id: note.id,
    kind: 'set_note',
    current_version: { ...note, shared: false },
    incoming_operation: operation,
    expected_revision: 1,
    resolved_at: null,
    selected_version: null,
  };
  const draft = {
    id: id(13),
    workspace_id: scope.workspaceId,
    workout_instance_id: note.workout_instance_id,
    operation: correction
      ? {
          ...operation,
          kind: 'resolve_conflict',
          payload: {
            conflict_id: conflict.id,
            selected_version: 'incoming',
            expected_revision: 1,
          },
        }
      : operation,
    created_at: snapshot.exported_at,
    applied_at: null,
    applied_request_id: null,
  };
  const calls: string[] = [];
  const transport = {
    from: (table: 'workout_sync_conflicts' | 'workout_correction_drafts') => ({
      select: (_columns: string) => {
        const response: { data: unknown[]; error: null } = {
          data: [],
          error: null,
        };
        const rows =
          table === 'workout_sync_conflicts'
            ? Array.from({ length: count }, (_, i) => ({
                ...conflict,
                id: count === 1 ? conflict.id : id(1000 + i),
              }))
            : [draft];
        const query: Promise<{ data: unknown[]; error: null }> & {
          eq: jest.Mock;
          order: jest.Mock;
          range: jest.Mock;
          setHeader: jest.Mock;
        } = Object.assign(
          hung
            ? new Promise<{ data: unknown[]; error: null }>(() => undefined)
            : Promise.resolve(response),
          {
            eq: jest.fn(() => query),
            order: jest.fn(() => query),
            range: jest.fn((from: number, to: number) => {
              response.data = rows.slice(from, Math.min(to + 1, from + cap));
              return query;
            }),
            setHeader: jest.fn((key: string, value: string) => {
              calls.push(`${key}:${value}`);
              return query;
            }),
          },
        );
        return query;
      },
    }),
  };
  return {
    reader: createServerContextReader(transport, {
      token: 'synthetic-pinned-token',
      guard: async () => undefined,
    }),
    calls,
    conflict,
    draft,
  };
}
test('actual server conflict source survives collector with underscored source ID and both note versions', async () => {
  const x = context();
  const result = await collectAccountExport({
    scope,
    server: parseAccountExport(snapshot, {
      ownerUserId: scope.accountId,
      workspaceId: scope.workspaceId,
    }),
    guard: async () => undefined,
    isCurrent: () => true,
    local: null,
    context: x.reader,
  });
  expect(
    result.envelope.sources.find((s) => s.id === 'workout_sync_conflicts'),
  ).toMatchObject({ state: 'incomplete', records: [x.conflict] });
  expect(
    result.envelope.sources.find((s) => s.id === 'workout_correction_drafts'),
  ).toMatchObject({ state: 'incomplete', records: [x.draft] });
  expect(
    x.calls.every(
      (call) => call === 'Authorization:Bearer synthetic-pinned-token',
    ),
  ).toBe(true);
});
test('resolve_conflict correction entity differs from workout and retains operation context', async () => {
  const x = context(true);
  const sources = await x.reader(scope);
  expect(
    sources.find((s) => s.id === 'workout_correction_drafts'),
  ).toMatchObject({ state: 'incomplete', records: [x.draft] });
});
test('standalone hung server queries finish with explicit unknown gaps', async () => {
  jest.useFakeTimers();
  try {
    const x = context(false, true);
    const reading = x.reader(scope);
    await jest.advanceTimersByTimeAsync(31000);
    const sources = await reading;
    expect(sources).toHaveLength(2);
    expect(
      sources.every(
        (source) =>
          source.state === 'unknown' &&
          source.records.length === 0 &&
          source.gaps.length > 0,
      ),
    ).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});
test('backend cap fifty does not truncate 151 conflict contexts and preserves pinned tenant requests', async () => {
  const x = context(false, false, 151, 50);
  const sources = await x.reader(scope);
  const conflicts = sources.find(
    (source) => source.id === 'workout_sync_conflicts',
  );
  expect(conflicts?.records).toHaveLength(151);
  expect(conflicts?.state).toBe('incomplete');
  expect(x.calls).toHaveLength(7);
  expect(
    x.calls.every(
      (call) => call === 'Authorization:Bearer synthetic-pinned-token',
    ),
  ).toBe(true);
});
test('standalone stalled auth guard remains bounded even on error cleanup path', async () => {
  jest.useFakeTimers();
  try {
    const transport = { from: jest.fn() };
    const reader = createServerContextReader(transport, {
      token: 'synthetic',
      guard: () => new Promise<void>(() => undefined),
    });
    const reading = reader(scope);
    const rejection = expect(reading).rejects.toMatchObject({
      code: 'network',
    });
    await jest.advanceTimersByTimeAsync(10001);
    await rejection;
    expect(transport.from).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

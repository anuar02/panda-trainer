import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getSupabaseClient } from '@/features/auth/client';
import { loadWorkspaceClientDetails } from '@/features/workspace-clients/service';

jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));

const workspaceId = '61000000-0000-4000-8000-000000000001';
const clientId = '71000000-0000-4000-8000-000000000001';
const program = {
  id: 'program',
  workspace_id: workspaceId,
  client_record_id: clientId,
  base_template_id: 'template',
  base_template_revision: 3,
  name: 'Immutable plan',
  description: 'Original description',
  revision: 2,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
};
const exercise = {
  id: 'line',
  workspace_id: workspaceId,
  client_program_id: program.id,
  exercise_id: 'exercise',
  exercise_name_snapshot: 'Original exercise',
  source_key_snapshot: null,
  measure_snapshot: 'seconds',
  bodyweight_snapshot: true,
  muscle_group_snapshot: 'core',
  equipment_snapshot: 'none',
  instructions_snapshot: ['Original instruction'],
  position: 0,
  planned_sets: 3,
  planned_reps: null,
  planned_seconds: '30–45',
  planned_weight_g: 0,
  rest_seconds: 45,
  note: 'Public plan note',
  revision: 1,
  created_at: program.created_at,
  updated_at: program.updated_at,
};

type Query = Promise<{ data: unknown; error: null }> & {
  select: jest.Mock;
  eq: jest.Mock;
  is: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  maybeSingle: jest.Mock;
};

function setup(hasProgram = true) {
  const builders = new Map<string, ReturnType<typeof builder>>();
  function builder(table: string): Query {
    const data =
      table === 'client_records'
        ? { id: clientId, name: 'Real client' }
        : table === 'client_programs'
          ? hasProgram
            ? program
            : null
          : table === 'client_program_exercises'
            ? [exercise]
            : [];
    const response = Promise.resolve({ data, error: null });
    let query: Query;
    query = Object.assign(response, {
      select: jest.fn((columns: string) => {
        if (
          table.startsWith('client_program') &&
          (columns === '*' || columns.split(',').includes('created_by'))
        )
          throw new Error('Audit columns are not selectable');
        return query;
      }),
      eq: jest.fn(() => query),
      is: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
      maybeSingle: jest.fn(() => query),
    });
    return query;
  }
  const from = jest.fn((table: string) => {
    const query = builder(table);
    builders.set(table, query);
    return query;
  });
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue({ from } as unknown as SupabaseClient<Database>);
  return { from, builders };
}

afterEach(() => jest.resetAllMocks());

test('reads immutable plan metadata with safe projections and latest-copy ordering', async () => {
  const { builders } = setup();
  const result = await loadWorkspaceClientDetails(workspaceId, clientId);
  expect(result?.program).toEqual({ ...program, items: [exercise] });
  for (const table of ['client_programs', 'client_program_exercises']) {
    const query = builders.get(table);
    const columns = query?.select.mock.calls[0]?.[0].split(',');
    expect(columns).not.toContain('*');
    expect(columns).not.toContain('created_by');
    expect(columns?.sort()).toEqual(
      Object.keys(table === 'client_programs' ? program : exercise).sort(),
    );
    expect(query?.eq).toHaveBeenCalledWith('workspace_id', workspaceId);
  }
  expect(builders.get('client_programs')?.eq).toHaveBeenCalledWith(
    'client_record_id',
    clientId,
  );
  expect(builders.get('client_programs')?.order.mock.calls).toEqual([
    ['created_at', { ascending: false }],
    ['id', { ascending: false }],
  ]);
  expect(builders.get('client_programs')?.limit).toHaveBeenCalledWith(1);
  expect(builders.get('client_program_exercises')?.eq).toHaveBeenCalledWith(
    'client_program_id',
    program.id,
  );
  expect(builders.get('client_program_exercises')?.order).toHaveBeenCalledWith(
    'position',
  );
});

test('keeps an unassigned client empty without requesting exercise rows', async () => {
  const { from } = setup(false);
  expect(
    (await loadWorkspaceClientDetails(workspaceId, clientId))?.program,
  ).toBeNull();
  expect(from).not.toHaveBeenCalledWith('client_program_exercises');
});

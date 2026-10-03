import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  loadWorkspaceSchedule,
  MAX_WORKSPACE_SCHEDULE_READ_PAGES,
} from '../src/features/workspace-scheduling/service';
import { WorkspaceScheduleSessionError } from '../src/features/workspace-scheduling/read-session';
import type { Database } from '../src/lib/database.types';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));

const workspaceId = '61000000-0000-4000-8000-000000000001';
const foreignId = '61000000-0000-4000-8000-000000000002';
const userId = '51000000-0000-4000-8000-000000000001';
const clientId = '81000000-0000-4000-8000-000000000001';
const start = '2026-10-05T00:00:00.000Z';
const end = '2026-10-12T00:00:00.000Z';
const id = (n: number) =>
  `71000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Row = Record<string, unknown>;
const booking = (n = 1): Row => ({
  id: id(n),
  workspace_id: workspaceId,
  client_record_id: clientId,
  group_session_id: null,
  starts_at: '2026-10-06T10:00:00.000Z',
  ends_at: '2026-10-06T11:00:00.000Z',
  status: 'confirmed',
  revision: 1,
});
const proposal = (n = 1): Row => ({
  id: `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  workspace_id: workspaceId,
  booking_id: id(n),
  author_role: 'client',
  proposed_starts_at: '2026-11-12T11:00:00.000Z',
  proposed_ends_at: '2026-11-12T12:00:00.000Z',
  base_revision: 1,
  revision: 1,
  status: 'pending',
  created_at: start,
  updated_at: start,
});
type Fixtures = Record<string, Row[]> & {
  trainer_workspaces: Row[];
  bookings: Row[];
  client_records: Row[];
  booking_programs: Row[];
  schedule_proposals: Row[];
};
const fixtures = (): Fixtures => ({
  trainer_workspaces: [
    {
      id: workspaceId,
      owner_user_id: userId,
      timezone: 'Asia/Almaty',
      working_days: [1, 2, 3, 4, 5],
      day_start: '07:00:00',
      day_end: '21:00:00',
      usual_session_minutes: 60,
    },
  ],
  bookings: [booking()],
  client_records: [
    {
      id: clientId,
      workspace_id: workspaceId,
      display_name: 'Synthetic client',
    },
  ],
  booking_programs: [
    {
      id: 'b1000000-0000-4000-8000-000000000001',
      booking_id: id(1),
      workspace_id: workspaceId,
      name: 'Synthetic program',
    },
  ],
  schedule_proposals: [proposal()],
});
type Read = { table: string; offset: number; ids: unknown[] | null };
const install = (
  rows: Record<string, Row[]>,
  alter?: (read: Read, result: Row[]) => unknown,
) => {
  const headers: { table: string; name: string; value: string }[] = [];
  const reads: Read[] = [];
  const respond = (read: Read, selected: Row[], single = false) => {
    reads.push(read);
    const result = alter ? alter(read, selected) : selected;
    return Object.assign(
      Promise.resolve({
        data: single && Array.isArray(result) ? (result[0] ?? null) : result,
        error: null,
      }),
      {
        setHeader: (name: string, value: string) => {
          headers.push({ table: read.table, name, value });
          return Promise.resolve({
            data:
              single && Array.isArray(result) ? (result[0] ?? null) : result,
            error: null,
          });
        },
      },
    );
  };
  const from = (table: string) => {
    let offset = 0;
    let limit: number | null = null;
    let ids: unknown[] | null = null;
    let idField = 'id';
    let single = false;
    let ranged = false;
    const query: Record<string, unknown> = {};
    query.select = () => query;
    query.setHeader = (name: string, value: string) => {
      headers.push({ table, name, value });
      return query;
    };
    query.eq = () => query;
    query.lt = () => {
      ranged = true;
      return query;
    };
    query.gt = () => query;
    query.order = () => query;
    query.in = (field: string, values: unknown[]) => {
      ids = values;
      idField = field;
      return query;
    };
    query.range = (first: number, last: number) => {
      offset = first;
      limit = last - first + 1;
      return query;
    };
    query.maybeSingle = () => {
      single = true;
      return query;
    };
    query.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => {
      let selected = rows[table] ?? [];
      if (ids) selected = selected.filter((row) => ids?.includes(row[idField]));
      if (ranged)
        selected = selected.filter(
          (row) => String(row.starts_at) < end && String(row.ends_at) > start,
        );
      selected = selected.slice(
        offset,
        limit === null ? undefined : offset + limit,
      );
      return respond({ table, offset, ids }, selected, single).then(
        resolve,
        reject,
      );
    };
    return query;
  };
  const rpc = (_name: string, args: { p_offset: number; p_limit: number }) =>
    respond(
      { table: 'schedule_proposals', offset: args.p_offset, ids: null },
      (rows.schedule_proposals ?? []).slice(
        args.p_offset,
        args.p_offset + args.p_limit,
      ),
    );
  jest.mocked(getSupabaseClient).mockReturnValue({
    from,
    rpc,
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: userId },
            access_token: `header.${Buffer.from(JSON.stringify({ sub: userId, session_id: 'd1000000-0000-4000-8000-000000000001' })).toString('base64url')}.signature`,
          },
        },
        error: null,
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  } as unknown as SupabaseClient<Database>);
  return Object.assign(reads, { headers });
};
const load = () => loadWorkspaceSchedule(workspaceId, start, end);

describe('workspace schedule untrusted reads', () => {
  beforeEach(() => jest.mocked(getSupabaseClient).mockReset());
  it.each([
    'trainer_workspaces',
    'bookings',
    'client_records',
    'booking_programs',
    'schedule_proposals',
  ])('rejects foreign rows from %s despite query filters', async (table) => {
    const rows = fixtures();
    const field = table === 'trainer_workspaces' ? 'id' : 'workspace_id';
    rows[table]![0] = { ...rows[table]![0], [field]: foreignId };
    install(rows);
    await expect(load()).rejects.toMatchObject({ code: 'request' });
  });
  it.each([
    ['bookings', 'id', 'invalid'],
    ['bookings', 'id', '71000000-0000-4000-8000-00000000000A'],
    ['bookings', 'group_session_id', '91000000-0000-4000-8000-00000000000A'],
    ['bookings', 'client_record_id', 'invalid'],
    ['bookings', 'group_session_id', 'invalid'],
    ['bookings', 'status', 'unexpected'],
    ['bookings', 'revision', 0],
    ['bookings', 'revision', 1.5],
    ['bookings', 'starts_at', '2026-02-30T10:00:00.000Z'],
    ['bookings', 'starts_at', '2026-10-06T10:00:00+03:00'],
    ['bookings', 'ends_at', '2026-10-06T10:00:00.000Z'],
    ['trainer_workspaces', 'timezone', 'Invalid/Zone'],
    ['trainer_workspaces', 'working_days', [1, 1]],
    ['trainer_workspaces', 'working_days', [7]],
    ['trainer_workspaces', 'day_start', '25:00:00'],
    ['trainer_workspaces', 'day_end', '07:00:00'],
    ['trainer_workspaces', 'usual_session_minutes', 0],
    ['client_records', 'display_name', 4],
    ['client_records', 'id', 'invalid'],
    ['booking_programs', 'booking_id', 'invalid'],
    ['booking_programs', 'name', 4],
    ['schedule_proposals', 'author_role', 'other'],
    ['schedule_proposals', 'status', 'accepted'],
    ['schedule_proposals', 'base_revision', 0],
    ['schedule_proposals', 'revision', 1.5],
    ['schedule_proposals', 'created_at', '2026-10-05T00:00:00+03:00'],
    ['schedule_proposals', 'proposed_ends_at', '2026-11-12T11:00:00.000Z'],
  ] as [string, string, unknown][])(
    'rejects malformed %s.%s (%p)',
    async (table, field, value) => {
      const rows = fixtures();
      install(rows, (read, result) =>
        read.table === table
          ? result.map((row) => ({ ...row, [field]: value }))
          : result,
      );
      await expect(load()).rejects.toMatchObject({ code: 'request' });
    },
  );
  it.each([
    'bookings',
    'client_records',
    'booking_programs',
    'schedule_proposals',
  ])('rejects duplicate %s rows', async (table) => {
    const rows = fixtures();
    rows[table]!.push({ ...rows[table]![0] });
    install(rows);
    await expect(load()).rejects.toMatchObject({ code: 'request' });
  });
  it.each([
    'bookings',
    'client_records',
    'booking_programs',
    'schedule_proposals',
  ])('rejects a non-array %s response', async (table) => {
    install(fixtures(), (read, result) => (read.table === table ? {} : result));
    await expect(load()).rejects.toMatchObject({ code: 'request' });
  });
  it('reads all bookings and outside-week proposals beyond the first page', async () => {
    const rows = fixtures();
    rows.bookings = Array.from({ length: 501 }, (_, n) => booking(n + 1));
    rows.schedule_proposals = Array.from({ length: 501 }, (_, n) =>
      proposal(n + 1),
    );
    rows.bookings.push({
      ...booking(502),
      starts_at: '2026-11-01T10:00:00.000Z',
      ends_at: '2026-11-01T11:00:00.000Z',
    });
    rows.schedule_proposals.push(proposal(502));
    const reads = install(rows);
    const result = await load();
    expect(result.bookings).toHaveLength(501);
    expect(result.pendingProposals).toHaveLength(502);
    expect(result.pendingProposals[501]!.booking.id).toBe(id(502));
    expect(reads).toContainEqual({ table: 'bookings', offset: 500, ids: null });
    expect(reads).toContainEqual({
      table: 'schedule_proposals',
      offset: 500,
      ids: null,
    });
  });
  it('fails the complete read when the second booking page is malformed', async () => {
    const rows = fixtures();
    rows.bookings = Array.from({ length: 501 }, (_, n) => booking(n + 1));
    install(rows, (read, result) =>
      read.table === 'bookings' && read.offset === 500
        ? [{ ...result[0], workspace_id: foreignId }]
        : result,
    );
    await expect(load()).rejects.toMatchObject({ code: 'request' });
  });
  it('validates supplemental bookings outside the requested week', async () => {
    const rows = fixtures();
    rows.bookings[0] = {
      ...booking(),
      starts_at: '2026-11-01T10:00:00.000Z',
      ends_at: '2026-11-01T11:00:00.000Z',
      revision: 0,
    };
    install(rows);
    await expect(load()).rejects.toMatchObject({ code: 'request' });
  });
  it('rejects oversized pages instead of returning truncated success', async () => {
    install(fixtures(), (read, result) =>
      read.table === 'bookings'
        ? Array.from({ length: 501 }, (_, n) => booking(n + 1))
        : result,
    );
    await expect(load()).rejects.toMatchObject({ code: 'request' });
  });
  it('fails explicitly at the read limit without returning a partial schedule', async () => {
    install(fixtures(), (read, result) =>
      read.table === 'bookings'
        ? Array.from({ length: 500 }, (_, n) => booking(read.offset + n + 1))
        : result,
    );
    await expect(load()).rejects.toMatchObject({ code: 'readLimit' });
    expect(MAX_WORKSPACE_SCHEDULE_READ_PAGES).toBeGreaterThan(1);
  });
  it('discards a read when the caller switches scope between pages', async () => {
    const rows = fixtures();
    rows.bookings = Array.from({ length: 501 }, (_, n) => booking(n + 1));
    let current = true;
    const scopeChanged = new Error('Scope changed');
    install(rows, (read, result) => {
      if (read.table === 'bookings' && read.offset === 500) current = false;
      return result;
    });
    await expect(
      loadWorkspaceSchedule(workspaceId, start, end, {
        assertCurrent: () => {
          if (!current) throw scopeChanged;
        },
      }),
    ).rejects.toBe(scopeChanged);
  });
  it.each(['client_records', 'booking_programs'])(
    'rejects unrelated %s rows from a related-record batch',
    async (table) => {
      install(fixtures(), (read, result) =>
        read.table === table
          ? result.map((row) => ({
              ...row,
              [table === 'client_records' ? 'id' : 'booking_id']: id(999),
            }))
          : result,
      );
      await expect(load()).rejects.toMatchObject({ code: 'request' });
    },
  );
  it('rejects proposals with a future base revision', async () => {
    const rows = fixtures();
    rows.schedule_proposals[0]!.base_revision = 2;
    install(rows);
    await expect(load()).rejects.toMatchObject({ code: 'request' });
  });
  it('rejects a different authenticated session during a later page', async () => {
    const rows = fixtures();
    rows.bookings = Array.from({ length: 501 }, (_, n) => booking(n + 1));
    install(rows, (read, result) => {
      if (read.table === 'bookings' && read.offset === 500) {
        const client = jest.mocked(getSupabaseClient).mock.results[0]!.value!;
        Object.assign(client.auth, {
          getSession: async () => ({
            data: {
              session: {
                user: { id: userId },
                access_token: `header.${Buffer.from(JSON.stringify({ sub: userId, session_id: 'd1000000-0000-4000-8000-000000000002' })).toString('base64url')}.signature`,
              },
            },
            error: null,
          }),
        });
      }
      return result;
    });
    await expect(load()).rejects.toBeInstanceOf(WorkspaceScheduleSessionError);
  });
  it('fails explicitly at the proposal page limit', async () => {
    install(fixtures(), (read, result) =>
      read.table === 'schedule_proposals'
        ? Array.from({ length: 500 }, (_, n) => proposal(read.offset + n + 1))
        : result,
    );
    await expect(load()).rejects.toMatchObject({ code: 'readLimit' });
  });
  it.each(['logout', 'differentUser'])(
    'rejects %s between pages',
    async (change) => {
      const rows = fixtures();
      rows.bookings = Array.from({ length: 501 }, (_, n) => booking(n + 1));
      install(rows, (read, result) => {
        if (read.table === 'bookings' && read.offset === 500) {
          const client = jest.mocked(getSupabaseClient).mock.results[0]!.value!;
          Object.assign(client.auth, {
            getSession: async () => ({
              data: {
                session:
                  change === 'logout'
                    ? null
                    : {
                        user: { id: foreignId },
                        access_token: `header.${Buffer.from(JSON.stringify({ sub: foreignId, session_id: 'd1000000-0000-4000-8000-000000000001' })).toString('base64url')}.signature`,
                      },
              },
              error: null,
            }),
          });
        }
        return result;
      });
      await expect(load()).rejects.toBeInstanceOf(
        WorkspaceScheduleSessionError,
      );
    },
  );
  it('pins every query and RPC to the original token across refresh between pages', async () => {
    const rows = fixtures();
    rows.bookings = Array.from({ length: 501 }, (_, n) => booking(n + 1));
    rows.schedule_proposals = Array.from({ length: 501 }, (_, n) =>
      proposal(n + 1),
    );
    let originalToken = '';
    const reads = install(rows, (read, result) => {
      if (read.table === 'bookings' && read.offset === 0) {
        const client = jest.mocked(getSupabaseClient).mock.results[0]!.value!;
        Object.assign(client.auth, {
          getSession: async () => ({
            data: {
              session: {
                user: { id: userId },
                access_token: `refreshed.${Buffer.from(JSON.stringify({ sub: userId, session_id: 'd1000000-0000-4000-8000-000000000001' })).toString('base64url')}.signature`,
              },
            },
            error: null,
          }),
        });
      }
      return result;
    });
    const client = getSupabaseClient()!;
    originalToken = (await client.auth.getSession()).data.session!.access_token;
    const result = await load();
    expect(result.bookings).toHaveLength(501);
    expect(result.pendingProposals).toHaveLength(501);
    expect(reads.headers).toHaveLength(reads.length);
    expect(
      reads.headers.every(
        (header) =>
          header.name === 'Authorization' &&
          header.value === `Bearer ${originalToken}`,
      ),
    ).toBe(true);
    expect(new Set(reads.headers.map((header) => header.table))).toEqual(
      new Set([
        'trainer_workspaces',
        'bookings',
        'schedule_proposals',
        'client_records',
        'booking_programs',
      ]),
    );
  });
  it('rejects UUID duplicates represented with different letter case', async () => {
    const rows = fixtures();
    rows.bookings = [
      { ...booking(), id: '71000000-0000-4000-8000-00000000000a' },
      { ...booking(), id: '71000000-0000-4000-8000-00000000000A' },
    ];
    install(rows);
    await expect(load()).rejects.toMatchObject({ code: 'request' });
  });
});

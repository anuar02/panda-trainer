import { financialPage } from '../src/features/trainer-billing/read-page';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/features/auth/client';
import { loadTrainerBilling } from '../src/features/trainer-billing/service';
import { loadTrainerPayments } from '../src/features/trainer-payments/service';
import { financialToken } from './financial-read-fixtures';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
const id = (n: number) =>
  `94ab0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = {
  expectedUserId: id(1),
  workspaceId: id(2),
  clientRecordId: id(3),
};
const purchase = {
  id: id(4),
  workspace_id: id(2),
  client_record_id: id(3),
  title: 'Synthetic',
  units: 10,
  price_minor: '9223372036854775807',
  currency: 'KZT',
  expires_on: null,
  created_at: '2026-10-03T00:00:00Z',
};
const grant = {
  id: id(5),
  workspace_id: id(2),
  client_record_id: id(3),
  purchase_id: id(4),
  attendance_id: null,
  booking_id: null,
  cycle: null,
  kind: 'grant',
  units: 10,
  reason: null,
  reverses_entry_id: null,
  created_at: purchase.created_at,
};
const payment = {
  id: id(6),
  workspace_id: id(2),
  client_record_id: id(3),
  purchase_id: id(4),
  kind: 'payment',
  amount_minor: '1',
  currency: 'KZT',
  paid_on: '2026-10-03',
  method: 'Kaspi',
  source: 'manual',
  reason: null,
  reverses_entry_id: null,
  created_at: purchase.created_at,
};
let current: Session | null;
let listeners: Set<(event: AuthChangeEvent, session: Session | null) => void>;
let tables: Record<string, unknown[]>;
let respond: (
  table: string,
  offset: number,
) => Promise<{ data: unknown; count: number | null; error: null }>;
const makeSession = (sid = id(90), version = 1) =>
  ({
    user: { id: scope.expectedUserId },
    access_token: financialToken(scope.expectedUserId, sid, version),
  }) as Session;
const emit = (event: AuthChangeEvent, session: Session | null) => {
  current = session;
  for (const listener of listeners) listener(event, session);
};
const calls: { table: string; offset: number; token: string }[] = [];
beforeEach(() => {
  listeners = new Set();
  calls.length = 0;
  current = makeSession();
  tables = {
    client_purchases: [purchase],
    credit_entries: [grant],
    attendance_records: [],
    attendance_revisions: [],
    payment_entries: [payment],
  };
  respond = async (table, offset) => ({
    data: tables[table]!.slice(offset, offset + 500),
    count: tables[table]!.length,
    error: null,
  });
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession: async () => ({ data: { session: current }, error: null }),
      onAuthStateChange: (
        listener: (event: AuthChangeEvent, session: Session | null) => void,
      ) => {
        listeners.add(listener);
        return {
          data: {
            subscription: { unsubscribe: () => listeners.delete(listener) },
          },
        };
      },
    },
    from: (table: string) => {
      let offset = 0;
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: (start: number) => {
          offset = start;
          return query;
        },
        setHeader: async (_name: string, token: string) => {
          calls.push({ table, offset, token });
          return respond(table, offset);
        },
      };
      return query;
    },
  } as unknown as NonNullable<ReturnType<typeof getSupabaseClient>>);
});

const readers = [loadTrainerBilling, loadTrainerPayments];
test.each(readers)(
  '%p rejects same-user relogin before publication',
  async (read) => {
    const original = respond;
    let switched = false;
    respond = async (table, offset) => {
      const value = await original(table, offset);
      if (!switched) {
        switched = true;
        emit('SIGNED_OUT', null);
        emit('SIGNED_IN', makeSession(id(91)));
      }
      return value;
    };
    await expect(read(scope)).rejects.toMatchObject({ code: 'unavailable' });
    expect(listeners.size).toBe(0);
  },
);
test.each(readers)(
  '%p allows refresh with the same stable session and binds all headers',
  async (read) => {
    const original = respond;
    respond = async (table, offset) => {
      emit('TOKEN_REFRESHED', makeSession(id(90), 2));
      return original(table, offset);
    };
    await expect(read(scope)).resolves.toBeDefined();
    expect(
      calls.every(
        (call) => call.token === `Bearer ${makeSession().access_token}`,
      ),
    ).toBe(true);
    expect(listeners.size).toBe(0);
  },
);
test.each(readers)(
  '%p rechecks session even without an auth event',
  async (read) => {
    const original = respond;
    respond = async (table, offset) => {
      const value = await original(table, offset);
      current = makeSession(id(91));
      return value;
    };
    await expect(read(scope)).rejects.toMatchObject({ code: 'unavailable' });
  },
);
test.each(readers)(
  '%p rejects truncated pages and missing counts',
  async (read) => {
    respond = async () => ({ data: [], count: 1, error: null });
    await expect(read(scope)).rejects.toMatchObject({ code: 'request' });
    respond = async () => ({ data: [], count: null, error: null });
    await expect(read(scope)).rejects.toMatchObject({ code: 'request' });
  },
);
test.each(readers)(
  '%p rejects the bounded row limit before returning a snapshot',
  async (read) => {
    respond = async () => ({ data: [], count: 10001, error: null });
    await expect(read(scope)).rejects.toMatchObject({ code: 'request' });
  },
);
test.each(readers)('%p fails closed on oversized pages', async (read) => {
  respond = async () => ({
    data: Array.from({ length: 501 }, () => purchase),
    count: 501,
    error: null,
  });
  await expect(read(scope)).rejects.toMatchObject({ code: 'request' });
});
test('both services read more than 500 rows with complete counted pages', async () => {
  tables.client_purchases = Array.from({ length: 501 }, (_, n) => ({
    ...purchase,
    id: id(1000 + n),
  }));
  tables.credit_entries = Array.from({ length: 501 }, (_, n) => ({
    ...grant,
    id: id(2000 + n),
    purchase_id: id(1000 + n),
  }));
  tables.payment_entries = Array.from({ length: 501 }, (_, n) => ({
    ...payment,
    id: id(3000 + n),
    purchase_id: id(1000 + n),
  }));
  expect((await loadTrainerBilling(scope)).purchases).toHaveLength(501);
  expect((await loadTrainerPayments(scope)).entries).toHaveLength(501);
  expect(calls.filter((call) => call.offset === 500)).toHaveLength(4);
});
test.each(readers)('%p stops a session switch between pages', async (read) => {
  tables.client_purchases = Array.from({ length: 501 }, (_, n) => ({
    ...purchase,
    id: id(1000 + n),
  }));
  tables.payment_entries = Array.from({ length: 501 }, (_, n) => ({
    ...payment,
    id: id(3000 + n),
  }));
  const original = respond;
  respond = async (table, offset) => {
    const value = await original(table, offset);
    if (offset === 500) emit('SIGNED_IN', makeSession(id(91)));
    return value;
  };
  await expect(read(scope)).rejects.toMatchObject({ code: 'unavailable' });
});
test.each(readers)(
  '%p rejects case-insensitive duplicate IDs across pages',
  async (read) => {
    const table =
      read === loadTrainerBilling ? 'client_purchases' : 'payment_entries';
    const row = table === 'client_purchases' ? purchase : payment;
    tables[table] = Array.from({ length: 501 }, (_, n) => ({
      ...row,
      id: id(1000 + (n === 500 ? 0 : n)).toUpperCase(),
    }));
    await expect(read(scope)).rejects.toMatchObject({ code: 'request' });
  },
);
test('billing rejects missing grants and foreign credit relations', async () => {
  tables.credit_entries = [];
  await expect(loadTrainerBilling(scope)).rejects.toMatchObject({
    code: 'request',
  });
  tables.credit_entries = [{ ...grant, purchase_id: id(99) }];
  await expect(loadTrainerBilling(scope)).rejects.toMatchObject({
    code: 'request',
  });
});
test('payments rejects missing, foreign and duplicate reversal parents', async () => {
  const reversal = {
    ...payment,
    id: id(7),
    kind: 'reversal',
    amount_minor: '-1',
    reason: 'Synthetic correction',
    reverses_entry_id: id(6),
  };
  tables.payment_entries = [reversal];
  await expect(loadTrainerPayments(scope)).rejects.toMatchObject({
    code: 'request',
  });
  tables.payment_entries = [payment, { ...reversal, purchase_id: id(99) }];
  await expect(loadTrainerPayments(scope)).rejects.toMatchObject({
    code: 'request',
  });
  tables.payment_entries = [payment, reversal, { ...reversal, id: id(8) }];
  await expect(loadTrainerPayments(scope)).rejects.toMatchObject({
    code: 'request',
  });
  tables.payment_entries = [payment, reversal];
  expect((await loadTrainerPayments(scope)).entries).toHaveLength(2);
});

test.each(readers)(
  '%p rejects a switch at the final publication check',
  async (read) => {
    const client = getSupabaseClient()!;
    let calls = 0;
    jest.spyOn(client.auth, 'getSession').mockImplementation(async () => {
      calls += 1;
      if (calls === (read === loadTrainerBilling ? 10 : 6))
        current = makeSession(id(91));
      return current
        ? { data: { session: current }, error: null }
        : { data: { session: null }, error: null };
    });
    await expect(read(scope)).rejects.toMatchObject({ code: 'unavailable' });
  },
);
test.each(readers)('%p rejects changed count between pages', async (read) => {
  const table =
    read === loadTrainerBilling ? 'client_purchases' : 'payment_entries';
  const row = table === 'client_purchases' ? purchase : payment;
  tables[table] = Array.from({ length: 501 }, (_, n) => ({
    ...row,
    id: id(1000 + n),
  }));
  const original = respond;
  respond = async (table, offset) => {
    const value = await original(table, offset);
    return offset === 500 ? { ...value, count: 502 } : value;
  };
  await expect(read(scope)).rejects.toMatchObject({ code: 'request' });
});
test.each(readers)(
  '%p rejects malformed identity and never accepts token equality as session identity',
  async (read) => {
    current = { ...makeSession(), access_token: 'synthetic-opaque-token' };
    await expect(read(scope)).rejects.toMatchObject({ code: 'unavailable' });
    expect(calls).toHaveLength(0);
  },
);

test('counted paging accepts the exact limit and rejects invalid counts', () => {
  const fail = (): never => {
    throw new Error('invalid page');
  };
  expect(
    financialPage(Array.from({ length: 500 }), 10000, 9500, 10000, fail).done,
  ).toBe(true);
  for (const count of [-1, 1.5, Infinity, 10001]) {
    expect(() => financialPage([], count, 0, null, fail)).toThrow(
      'invalid page',
    );
  }
});
test.each(readers)(
  '%p rejects relation parents belonging to another client in workspace-wide reads',
  async (read) => {
    tables.client_purchases = [{ ...purchase, client_record_id: id(99) }];
    await expect(
      read({
        expectedUserId: scope.expectedUserId,
        workspaceId: scope.workspaceId,
      }),
    ).rejects.toMatchObject({ code: 'request' });
  },
);

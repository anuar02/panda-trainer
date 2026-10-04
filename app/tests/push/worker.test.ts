import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type {
  Claim,
  Transport,
} from '../../../supabase/functions/push-v1/worker';
const compiled = ts.transpileModule(
  readFileSync(
    path.resolve(__dirname, '../../../supabase/functions/push-v1/worker.ts'),
    'utf8',
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const loaded = {};
new Function('exports', compiled)(loaded);
const { deliver, runPush } =
  loaded as typeof import('../../../supabase/functions/push-v1/worker');
const claim: Claim = {
  id: 'delivery',
  lease: 'lease',
  state: 'sending',
  ticket: null,
  token: 'synthetic-token',
  notificationId: 'own-event',
  workspaceId: 'workspace',
  kind: 'booking_confirmed',
};
const transport = (status: number, body: unknown): Transport =>
  jest.fn(async () => ({ status, body }));
test('safe push includes only feed identifiers and static message', async () => {
  const network = transport(200, { data: { status: 'ok', id: 'ticket' } });
  expect(await deliver(claim, network)).toEqual({
    outcome: 'ticket',
    ticket: 'ticket',
  });
  expect(network).toHaveBeenCalledWith('https://exp.host/--/api/v2/push/send', {
    to: 'synthetic-token',
    title: 'Тренировочный блокнот',
    body: 'Занятие подтверждено',
    sound: 'default',
    channelId: 'default',
    data: { version: 1, notificationId: 'own-event', workspaceId: 'workspace' },
  });
});
test.each([null, {}, { data: [] }, { data: { status: 'ok' } }])(
  'malformed send remains unknown',
  async (body) => {
    expect((await deliver(claim, transport(200, body))).outcome).toBe(
      'unknown',
    );
  },
);
test('network unknown and HTTP 5xx are not retried as certain rejection', async () => {
  expect(
    (
      await deliver(claim, async () => {
        throw new Error('lost');
      })
    ).outcome,
  ).toBe('unknown');
  expect((await deliver(claim, transport(503, {}))).outcome).toBe('unknown');
  expect((await deliver(claim, transport(429, {}))).outcome).toBe('retry');
});
test.each([
  ['DeviceNotRegistered', 'invalid'],
  ['MessageRateExceeded', 'retry'],
  ['InvalidCredentials', 'failed'],
  ['MessageTooBig', 'failed'],
])('ticket error %s yields %s', async (error, outcome) => {
  expect(
    (
      await deliver(
        claim,
        transport(200, { data: { status: 'error', details: { error } } }),
      )
    ).outcome,
  ).toBe(outcome);
});
test('receipt confirms provider acceptance only; absent receipt waits', async () => {
  const receipt = { ...claim, state: 'receipt' as const, ticket: 'receipt-id' };
  expect(
    (
      await deliver(
        receipt,
        transport(200, { data: { 'receipt-id': { status: 'ok' } } }),
      )
    ).outcome,
  ).toBe('delivered');
  expect((await deliver(receipt, transport(200, { data: {} }))).outcome).toBe(
    'waiting',
  );
  expect(
    (
      await deliver(receipt, async () => {
        throw new Error('offline');
      })
    ).outcome,
  ).toBe('retry');
  expect(
    (
      await deliver(
        receipt,
        transport(200, {
          data: {
            'receipt-id': {
              status: 'error',
              details: { error: 'DeviceNotRegistered' },
            },
          },
        }),
      )
    ).outcome,
  ).toBe('invalid');
});
test('bounded worker schedules using fake clock then consumes atomic claims', async () => {
  const store = {
    schedule: jest.fn(async () => undefined),
    claim: jest.fn(async () => [claim]),
    complete: jest.fn(async () => undefined),
  };
  expect(
    await runPush(
      store,
      transport(200, { data: { status: 'ok', id: 'ticket' } }),
      new Date('2026-10-04T03:00:00Z'),
      '08:00',
      1,
    ),
  ).toEqual({ processed: 1 });
  expect(store.schedule).toHaveBeenCalledWith(
    '2026-10-04T03:00:00.000Z',
    '08:00',
  );
  expect(store.claim).toHaveBeenCalledWith(1);
  expect(store.complete).toHaveBeenCalledWith(claim, {
    outcome: 'ticket',
    ticket: 'ticket',
  });
  await expect(
    runPush(store, transport(200, {}), new Date(), ''),
  ).rejects.toThrow();
});

test('daily summary uses only current authorized aggregate count and feed identifiers', async () => {
  const network = transport(200, { data: { status: 'ok', id: 'ticket' } });
  expect(
    (await deliver({ ...claim, kind: 'daily_plan', summaryCount: 3 }, network))
      .outcome,
  ).toBe('ticket');
  expect(network).toHaveBeenCalledWith(
    'https://exp.host/--/api/v2/push/send',
    expect.objectContaining({
      body: 'План занятий на сегодня. Занятий: 3',
      data: {
        version: 1,
        notificationId: claim.notificationId,
        workspaceId: claim.workspaceId,
      },
    }),
  );
});
test('empty or malformed daily aggregate cannot produce a false summary', async () => {
  const network = transport(200, {});
  for (const summaryCount of [null, undefined, 0, -1, 1.5])
    expect(
      (await deliver({ ...claim, kind: 'daily_plan', summaryCount }, network))
        .outcome,
    ).toBe('failed');
  expect(network).not.toHaveBeenCalled();
});

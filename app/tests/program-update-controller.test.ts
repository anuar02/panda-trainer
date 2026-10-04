import { randomUUID } from 'expo-crypto';
import type { UpdateCommand } from '@/domain/program-update';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUpdateController,
  type UpdateState,
} from '@/features/program-update/controller';
import { loadPendingUpdateCommand } from '@/features/program-update/pending';
import {
  updateContext as context,
  updateReceipt as receipt,
  updateId as id,
} from './program-update-fixtures';
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '52000000-0000-4000-8000-000000000008'),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));
let rows: Map<string, string>;
beforeEach(() => {
  rows = new Map();
  jest.clearAllMocks();
  jest.mocked(randomUUID).mockReset().mockReturnValue(id(8));
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (k) => rows.get(k) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (k, v) => {
    rows.set(k, v);
  });
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async (k) => {
    rows.delete(k);
  });
});
function fixture() {
  let current = true;
  let state: UpdateState | null = null;
  const transport = {
    valid: () => true,
    dispose: jest.fn(),
    load: jest.fn(async () => context),
    apply: jest.fn(async (_command: UpdateCommand) => receipt),
  };
  const controller = createUpdateController({
    transport,
    actorId: id(1),
    workspaceId: id(2),
    workoutId: id(5),
    clientRecordId: id(4),
    current: () => current,
    changed: (s) => {
      state = s;
    },
  });
  return {
    controller,
    transport,
    state: () => state!,
    stop: () => {
      current = false;
    },
  };
}
test('finish partial saved results → no selection → explicit selection → copy → readback clears intent', async () => {
  const f = fixture();
  await f.controller.load();
  await f.controller.confirm();
  expect(f.transport.apply).not.toHaveBeenCalled();
  f.controller.toggle(context.options[0]!.key);
  f.transport.load.mockResolvedValue({
    ...context,
    program_id: receipt.program_id,
  });
  await f.controller.confirm();
  expect(f.state().applied).toBe(true);
  expect(f.state().pending).toBeNull();
  expect(rows.size).toBe(0);
  expect(f.transport.apply.mock.calls[0]?.[0]).toMatchObject({
    requestId: receipt.request_id,
    expectedWorkoutRevision: 3,
  });
});
test('timeout/reopen replays exact persisted command with no new ID or selected payload', async () => {
  const first = fixture();
  await first.controller.load();
  first.controller.toggle(context.options[0]!.key);
  first.transport.apply.mockRejectedValue(new Error('timeout'));
  await first.controller.confirm();
  const pending = await loadPendingUpdateCommand(id(1), id(2), id(5), id(4));
  expect(pending).not.toBeNull();
  const second = fixture();
  await second.controller.load();
  second.controller.toggle('other');
  second.transport.load.mockResolvedValue({
    ...context,
    program_id: receipt.program_id,
  });
  await second.controller.confirm();
  expect(second.transport.apply).toHaveBeenCalledWith(pending);
  expect(second.state().applied).toBe(true);
});
test('conflict can be explicitly discarded; unknown cannot create another command', async () => {
  const f = fixture();
  await f.controller.load();
  f.controller.toggle(context.options[0]!.key);
  f.transport.apply.mockRejectedValue(new Error('timeout'));
  await f.controller.confirm();
  await f.controller.reject();
  expect(rows.size).toBe(1);
  f.transport.apply.mockRejectedValue(new Error('update_conflict'));
  await f.controller.confirm();
  await f.controller.reject();
  expect(rows.size).toBe(0);
});
test('late success after dismiss preserves recovery and never publishes readback or clears pending', async () => {
  const f = fixture();
  await f.controller.load();
  f.controller.toggle(context.options[0]!.key);
  let resolve: (v: typeof receipt) => void = () => {};
  f.transport.apply.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const result = f.controller.confirm();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  f.stop();
  resolve(receipt);
  await result;
  expect(rows.size).toBe(1);
  expect(f.state().applied).toBe(false);
  expect(f.transport.load).toHaveBeenCalledTimes(1);
});
test('readback conflict keeps confirmed receipt retryable with the original ID', async () => {
  const f = fixture();
  await f.controller.load();
  f.controller.toggle(context.options[0]!.key);
  await f.controller.confirm();
  expect(f.state().error).toBe('update_unknown');
  expect(rows.size).toBe(1);
  expect(f.state().applied).toBe(false);
});
test('review conflict after reopen cannot discard a possibly committed unknown command', async () => {
  const first = fixture();
  await first.controller.load();
  first.controller.toggle(context.options[0]!.key);
  first.transport.apply.mockRejectedValue(new Error('timeout'));
  await first.controller.confirm();
  const next = fixture();
  next.transport.load.mockRejectedValue(new Error('update_conflict'));
  await next.controller.load();
  expect(next.state().error).toBe('update_unknown');
  await next.controller.reject();
  expect(rows.size).toBe(1);
});
test('confirmed receipt followed by read conflict keeps exact intent instead of enabling discard', async () => {
  const f = fixture();
  await f.controller.load();
  f.controller.toggle(context.options[0]!.key);
  f.transport.load.mockRejectedValue(new Error('update_conflict'));
  await f.controller.confirm();
  expect(f.state().error).toBe('update_unknown');
  await f.controller.reject();
  expect(rows.size).toBe(1);
});

test('another live controller adopts the unresolved intent without dispatching its new UUID', async () => {
  const first = fixture();
  const second = fixture();
  await first.controller.load();
  await second.controller.load();
  first.controller.toggle(context.options[0]!.key);
  second.controller.toggle(context.options[0]!.key);
  jest
    .mocked(randomUUID)
    .mockReturnValueOnce(id(8))
    .mockReturnValueOnce(id(20));
  first.transport.apply.mockRejectedValue(new Error('timeout'));
  await first.controller.confirm();
  await second.controller.confirm();
  expect(second.transport.apply).not.toHaveBeenCalled();
  expect(second.state().pending?.requestId).toBe(id(8));
  second.transport.load.mockResolvedValue({
    ...context,
    program_id: receipt.program_id,
  });
  await second.controller.confirm();
  expect(second.transport.apply.mock.calls[0]?.[0]?.requestId).toBe(id(8));
  expect(randomUUID).toHaveBeenCalledTimes(2);
});

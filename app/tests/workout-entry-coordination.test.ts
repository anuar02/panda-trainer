import {
  flushEntryWriters,
  registerEntryWriter,
} from '@/features/workout-entry/coordination';
import { deferred } from './workout-sync-fixtures';
it('waits for active participant writes before switching without waiting for another account', async () => {
  const pending = deferred<void>();
  const scope = { accountId: 'a', workspaceId: 'w' };
  const unregister = registerEntryWriter(scope, () => pending.promise);
  const other = jest.fn(async () => {});
  const unregisterOther = registerEntryWriter(
    { accountId: 'b', workspaceId: 'w' },
    other,
  );
  let done = false;
  const flushed = flushEntryWriters(scope).then(() => {
    done = true;
  });
  await Promise.resolve();
  expect(done).toBe(false);
  expect(other).not.toHaveBeenCalled();
  pending.resolve();
  await flushed;
  expect(done).toBe(true);
  unregister();
  unregisterOther();
  await flushEntryWriters(scope);
});

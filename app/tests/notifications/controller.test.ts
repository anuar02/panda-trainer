import { notificationPage, mergeNotifications } from '@/domain/notifications';
import {
  createNotificationController,
  type NotificationState,
} from '@/features/notifications/controller';
import { deferred, page, row, scope } from './fixtures';

test('domain validates ownership, safe payload, exact counts, bounds and stable ordering', () => {
  expect(notificationPage(page([row(2), row(1)], 2), scope).rows).toHaveLength(
    2,
  );
  for (const invalid of [
    page([{ ...row(), recipient_user_id: scope.workspaceId }]),
    {
      ...page(),
      rows: [{ ...row(), payload: { version: 1, secret: 'private' } }],
    },
    { ...page(), rows: [{ ...row(), private_notes: 'secret' }] },
    page([row(1), row(2)]),
    page([row(), row()]),
    page(Array.from({ length: 51 }, () => row())),
    page([], -1),
    page([], 0, true),
  ])
    expect(() => notificationPage(invalid, scope)).toThrow();
  expect(mergeNotifications([row(1, true), row(2)], [row(1), row(2)])).toEqual([
    row(2),
    row(1, true),
  ]);
});
test('pagination preserves every row, no duplicates and retains cursor for older data', async () => {
  const read = jest
    .fn()
    .mockResolvedValueOnce(page([row(3), row(2)], 3, true))
    .mockResolvedValueOnce(page([row(1)], 3));
  const states: NotificationState[] = [];
  const controller = createNotificationController(
    { page: read, mark: jest.fn() },
    (state) => states.push(state),
  );
  await controller.load();
  await controller.load(true);
  expect(read.mock.calls[1]?.[0]).toEqual({
    at: row(2).created_at,
    id: row(2).id,
  });
  expect(states.at(-1)).toMatchObject({
    rows: [row(3), row(2), row(1)],
    unreadCount: 3,
    hasMore: false,
  });
});
test('reconnect/replay and out-of-order reads cannot publish stale rows or late errors', async () => {
  const old = deferred<ReturnType<typeof page>>();
  const read = jest
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue(page([row(2)], 2));
  const publish = jest.fn();
  const controller = createNotificationController(
    { page: read, mark: jest.fn() },
    publish,
  );
  const before = controller.load();
  await controller.load();
  old.reject(new Error('old network'));
  await before;
  expect(publish.mock.calls.at(-1)?.[0]).toMatchObject({
    rows: [row(2)],
    failed: false,
  });
  await controller.load();
  expect(publish.mock.calls.at(-1)?.[0].rows).toEqual([row(2)]);
});
test('read mutation fences overlapping reads and reconciles the exact server count', async () => {
  const old = deferred<ReturnType<typeof page>>();
  const marked = deferred<ReturnType<typeof row>>();
  const read = jest
    .fn()
    .mockResolvedValueOnce(page())
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue(page([row(1, true)], 0));
  const publish = jest.fn();
  const mark = jest.fn().mockReturnValue(marked.promise);
  const controller = createNotificationController(
    { page: read, mark },
    publish,
  );
  await controller.load();
  const refresh = controller.load();
  const mutation = controller.mark(row().id);
  await controller.load();
  expect(read).toHaveBeenCalledTimes(2);
  marked.resolve(row(1, true));
  await mutation;
  old.resolve(page());
  await refresh;
  expect(publish.mock.calls.at(-1)?.[0]).toMatchObject({
    rows: [row(1, true)],
    unreadCount: 0,
    failed: false,
  });
});
test('dispose fences successful/failed late reads and marks, errors never become a zero count', async () => {
  const pending = deferred<ReturnType<typeof page>>();
  const publish = jest.fn();
  const controller = createNotificationController(
    { page: () => pending.promise, mark: jest.fn() },
    publish,
  );
  const load = controller.load();
  controller.dispose();
  const calls = publish.mock.calls.length;
  pending.resolve(page());
  await load;
  expect(publish).toHaveBeenCalledTimes(calls);
  const failPublish = jest.fn();
  const failed = createNotificationController(
    {
      page: async () => {
        throw new Error('offline');
      },
      mark: jest.fn(),
    },
    failPublish,
  );
  await failed.load();
  expect(failPublish.mock.calls.at(-1)?.[0]).toMatchObject({
    failed: true,
    unreadCount: null,
  });
});

test('SQL timestamp precision and omitted fraction retain exact descending order', () => {
  const precise = { ...row(1), created_at: '2026-10-04T10:00:01.000001+00:00' };
  const whole = { ...row(2), created_at: '2026-10-04T10:00:01+00:00' };
  expect(notificationPage(page([precise, whole], 2), scope).rows).toEqual([
    precise,
    whole,
  ]);
  expect(mergeNotifications([whole], [precise])).toEqual([precise, whole]);
});

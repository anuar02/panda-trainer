import { createScheduleReadController } from '../src/features/workspace-scheduling/read-controller';
const deferred = () => {
  let resolve!: (value: string) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
test('new retries supersede old successful and failed reads', async () => {
  const first = deferred();
  const second = deferred();
  const read = jest
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const publish = jest.fn();
  const controller = createScheduleReadController(read, publish);
  const old = controller.run();
  const next = controller.run();
  second.resolve('current');
  await next;
  first.reject(new Error('stale'));
  await old;
  expect(publish.mock.calls).toEqual([
    [null, false],
    [null, false],
    ['current', false],
  ]);
});
test.each(['stop', 'scope'] as const)(
  'invalidates guards and suppresses result after %s',
  async (change) => {
    const pending = deferred();
    let guard!: () => boolean;
    let current = true;
    const publish = jest.fn();
    const controller = createScheduleReadController(
      (isCurrent) => {
        guard = isCurrent;
        return pending.promise;
      },
      publish,
      () => current,
    );
    const run = controller.run();
    if (change === 'stop') controller.stop();
    else current = false;
    expect(guard()).toBe(false);
    pending.resolve('stale');
    await run;
    expect(publish.mock.calls).toEqual([[null, false]]);
  },
);

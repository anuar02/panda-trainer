import {
  createClientReadController,
  type ClientReadState,
} from '@/features/workspace-clients/read-controller';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test.each(['success', 'error'])(
  'late %s cannot replace a newer retry, and retry clears the previous data',
  async (kind) => {
    const old = deferred<string>();
    const next = deferred<string>();
    const states: ClientReadState<string>[] = [];
    const signals: AbortSignal[] = [];
    const load = jest.fn((signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? old.promise : next.promise;
    });
    const controller = createClientReadController(load, (state) =>
      states.push(state),
    );
    const first = controller.run();
    const second = controller.run();
    expect(signals[0]?.aborted).toBe(true);
    next.resolve('new snapshot');
    await second;
    if (kind === 'success') old.resolve('old snapshot');
    else old.reject(new Error('late request error'));
    await first;
    expect(states).toEqual([
      { status: 'loading', data: null },
      { status: 'loading', data: null },
      { status: 'ready', data: 'new snapshot' },
    ]);
    const retry = controller.run();
    expect(states.at(-1)).toEqual({ status: 'loading', data: null });
    await retry;
  },
);

test.each(['stop', 'invalidate', 'scope'])(
  '%s prevents late publish and clears a scoped snapshot',
  async (kind) => {
    const pending = deferred<string>();
    const states: ClientReadState<string>[] = [];
    let current = true;
    const controller = createClientReadController(
      () => pending.promise,
      (state) => states.push(state),
      () => current,
    );
    const run = controller.run();
    if (kind === 'stop') controller.stop();
    else if (kind === 'scope') current = false;
    else controller.invalidate();
    pending.resolve('private snapshot');
    await run;
    expect(states.some((state) => state.status === 'ready')).toBe(false);
    if (kind === 'invalidate')
      expect(states.at(-1)).toEqual({ status: 'failed', data: null });
  },
);

test('not-found is a completed read rather than an error, and failure can be retried', async () => {
  const states: ClientReadState<null>[] = [];
  const load = jest
    .fn<Promise<null>, [AbortSignal]>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(null);
  const controller = createClientReadController(load, (state) =>
    states.push(state),
  );
  await controller.run();
  expect(states.at(-1)).toEqual({ status: 'failed', data: null });
  await controller.run();
  expect(states.at(-1)).toEqual({ status: 'ready', data: null });
  controller.invalidate();
  expect(states.at(-1)).toEqual({ status: 'failed', data: null });
});

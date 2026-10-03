import {
  createErrorMonitoring,
  MAX_SESSION_EVENTS,
  MIN_EVENT_INTERVAL_MS,
} from '@/features/error-monitoring/monitor';
import {
  sanitizeEvent,
  sanitizeTransportEvent,
  validateConfig,
} from '@/features/error-monitoring/privacy';

const config = {
  enabled: true,
  optIn: true,
  region: 'eu',
  dsn: 'https://0123456789abcdef0123456789abcdef@o123.ingest.de.sentry.io/123',
  release: 'panda-trainer@0.1.0+08f0251',
  environment: 'pilot-synthetic',
  platform: 'ios',
};
const sensitive =
  'Synthetic Ada +77001112233 ada@example.test Bearer secret https://private.test/token';
const error = { code: 'APP_FONT_LOAD_FAILED' };
const safeConfig = validateConfig(config)!;

it('projects only allowed fields across sensitive and nested payloads', () => {
  const input = {
    ...error,
    message: sensitive,
    context: { notes: sensitive, deeper: { journal: sensitive } },
    request: { url: sensitive, headers: { Authorization: sensitive } },
    user: {
      id: sensitive,
      email: sensitive,
      name: sensitive,
      phone: sensitive,
    },
    notes: sensitive,
    token: sensitive,
    stack: sensitive,
    frames: [
      {
        filename: 'app/app/_layout.tsx',
        function: 'RootLayout',
        lineno: 12,
        vars: { password: sensitive },
        context_line: sensitive,
      },
      { filename: sensitive, function: sensitive, lineno: 1 },
      {
        filename: 'app/app/_layout.tsx',
        function: 'RootLayout',
        lineno: sensitive,
      },
    ],
  };
  const event = sanitizeEvent(input, safeConfig);
  expect(event).toEqual({
    message: 'APP_FONT_LOAD_FAILED',
    level: 'error',
    release: config.release,
    environment: 'pilot-synthetic',
    tags: { platform: 'ios' },
    exception: {
      values: [
        {
          type: 'AppError',
          value: 'APP_FONT_LOAD_FAILED',
          stacktrace: {
            frames: [
              {
                filename: 'app/app/_layout.tsx',
                function: 'RootLayout',
                lineno: 12,
              },
            ],
          },
        },
      ],
    },
  });
  expect(JSON.stringify(event)).not.toContain(sensitive);
  expect(
    sanitizeTransportEvent(
      {
        ...event,
        user: { id: sensitive },
        breadcrumbs: [sensitive],
        contexts: { trace: sensitive },
        request: input.request,
        extra: input,
      },
      safeConfig,
    ),
  ).toEqual(event);
});

it.each([
  null,
  sensitive,
  [],
  new Error(sensitive),
  { code: sensitive },
  { nested: error },
  { code: 'APP_FONT_LOAD_FAILED ' },
])('drops unknown input %p', (input) => {
  expect(sanitizeEvent(input, safeConfig)).toBeNull();
});

it('drops hostile getters, cycles and unsafe stack metadata', () => {
  const hostile = Object.defineProperty({}, 'code', {
    get() {
      throw new Error(sensitive);
    },
  });
  expect(sanitizeEvent(hostile, safeConfig)).toBeNull();
  const cyclic: Record<string, unknown> = { ...error };
  cyclic.nested = cyclic;
  expect(sanitizeEvent(cyclic, safeConfig)).toEqual(
    sanitizeEvent(error, safeConfig),
  );
  expect(
    sanitizeEvent(
      {
        ...error,
        frames: Array.from({ length: 100 }, () => ({
          filename: 'app/app/_layout.tsx',
          function: 'RootLayout',
          lineno: 10,
        })),
      },
      safeConfig,
    )?.exception?.values[0]?.stacktrace.frames,
  ).toHaveLength(8);
  for (const lineno of [0, -1, 100001, 1.5, NaN, Infinity]) {
    expect(
      sanitizeEvent(
        {
          ...error,
          frames: [
            { filename: 'app/app/_layout.tsx', function: 'RootLayout', lineno },
          ],
        },
        safeConfig,
      )?.exception,
    ).toBeUndefined();
  }
});

it.each([
  {},
  { enabled: false },
  { enabled: 'true' },
  { optIn: false },
  { optIn: undefined },
  { region: 'us' },
  { region: undefined },
  { dsn: '' },
  { dsn: config.dsn.replace('.de.', '.') },
  { dsn: config.dsn + '?secret=token' },
  { dsn: config.dsn + '#token' },
  { dsn: config.dsn.replace('https:', 'http:') },
  { dsn: config.dsn.replace('@o123', ':secret@o123') },
  { dsn: config.dsn.replace('.io/', '.io.evil.test/') },
  { release: sensitive },
  { environment: sensitive },
  { platform: sensitive },
])('disables invalid configuration %p', async (override) => {
  const input = Object.keys(override).length ? { ...config, ...override } : {};
  const send = jest.fn();
  expect(validateConfig(input)).toBeNull();
  expect(await createErrorMonitoring(input, send).report(error)).toBe(false);
  expect(send).not.toHaveBeenCalled();
});

it('does not consume quota for unknown input and bounds the session without retries', async () => {
  let time = 0;
  const send = jest.fn().mockResolvedValue(undefined);
  const monitor = createErrorMonitoring(config, send, () => time);
  expect(await monitor.report({ code: sensitive })).toBe(false);
  for (let i = 0; i < MAX_SESSION_EVENTS; i++) {
    expect(await monitor.report(error)).toBe(true);
    expect(await monitor.report(error)).toBe(false);
    time += MIN_EVENT_INTERVAL_MS;
  }
  expect(await monitor.report(error)).toBe(false);
  expect(send).toHaveBeenCalledTimes(MAX_SESSION_EVENTS);
});

it('blocks in-flight and recursive reporting', async () => {
  let finish: (() => void) | undefined;
  const send = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const monitor = createErrorMonitoring(config, send);
  const first = monitor.report(error);
  expect(await monitor.report(error)).toBe(false);
  finish?.();
  expect(await first).toBe(true);
  const recursive = createErrorMonitoring(config, async () => {
    expect(await recursive.report(error)).toBe(false);
  });
  expect(await recursive.report(error)).toBe(true);
});

it.each(['sync', 'async'])(
  'isolates %s transport failure and stops for the session',
  async (mode) => {
    const send = jest.fn(() => {
      if (mode === 'sync') throw new Error(sensitive);
      return Promise.reject(new Error(sensitive));
    });
    let time = 0;
    const monitor = createErrorMonitoring(config, send, () => time);
    expect(await monitor.report(error)).toBe(false);
    time = MIN_EVENT_INTERVAL_MS;
    expect(await monitor.report(error)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  },
);

it('drops non-finite and backwards clocks', async () => {
  let time = NaN;
  const send = jest.fn().mockResolvedValue(undefined);
  const monitor = createErrorMonitoring(config, send, () => time);
  expect(await monitor.report(error)).toBe(false);
  time = 10;
  expect(await monitor.report(error)).toBe(true);
  time = 0;
  expect(await monitor.report(error)).toBe(false);
});

it('snapshots validated fields once, including hostile changing getters', () => {
  let releaseReads = 0;
  const changingConfig = {
    ...config,
    get release() {
      releaseReads += 1;
      return releaseReads === 1 ? config.release : sensitive;
    },
  };
  expect(validateConfig(changingConfig)?.release).toBe(config.release);
  expect(releaseReads).toBe(1);
  let lineReads = 0;
  const frame = {
    filename: 'app/app/_layout.tsx',
    function: 'RootLayout',
    get lineno() {
      lineReads += 1;
      return lineReads === 1 ? 12 : sensitive;
    },
  };
  expect(
    sanitizeEvent({ ...error, frames: [frame] }, safeConfig)?.exception
      ?.values[0]?.stacktrace.frames[0]?.lineno,
  ).toBe(12);
  expect(lineReads).toBe(1);
});

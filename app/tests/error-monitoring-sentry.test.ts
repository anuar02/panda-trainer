import { createSentryTransport } from '@/features/error-monitoring/sentry-adapter';
import { createErrorMonitoring } from '@/features/error-monitoring/monitor';
import {
  sanitizeEvent,
  validateConfig,
} from '@/features/error-monitoring/privacy';

jest.mock('expo-crypto', () => ({
  randomUUID: () => '12345678-1234-4234-8234-123456789abc',
}));

const config = {
  enabled: true,
  optIn: true,
  region: 'eu',
  dsn: 'https://0123456789abcdef0123456789abcdef@o123.ingest.de.sentry.io/123',
  release: 'panda-trainer@0.1.0+08f0251',
  environment: 'pilot-synthetic',
  platform: 'ios',
};
const event = sanitizeEvent(
  { code: 'APP_FONT_LOAD_FAILED' },
  validateConfig(config)!,
)!;
const secret =
  'Synthetic Person secret@example.test +77001112233 Bearer token https://secret.test/journal';

it('uses the installed SDK client with a fake HTTP boundary and rebuilds the wire allowlist', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue({ ok: true, status: 200 } as Response);
  const transport = createSentryTransport(config, request);
  await transport({
    ...event,
    message: 'APP_FONT_LOAD_FAILED',
    user: { id: secret },
    request: { headers: secret },
    extra: { journal: { notes: secret } },
    breadcrumbs: [secret],
    contexts: { trace: secret },
  } as typeof event);
  expect(request).toHaveBeenCalledTimes(1);
  const [url, options] = request.mock.calls[0]!;
  expect(url).toBe(
    'https://o123.ingest.de.sentry.io/api/123/envelope/?sentry_version=7&sentry_key=0123456789abcdef0123456789abcdef',
  );
  expect(options).toMatchObject({
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
  });
  const body = String(options?.body);
  expect(body).not.toContain(secret);
  const [header, item, payload] = body
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);
  expect(header).toMatchObject({ sdk: { settings: { infer_ip: 'never' } } });
  expect(item).toEqual({ type: 'event' });
  expect(payload).toEqual(event);
});

it('never calls HTTP for disabled configuration or unknown codes', async () => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  await createSentryTransport({}, request)(event);
  await expect(
    createSentryTransport(
      config,
      request,
    )({ ...event, message: secret } as unknown as typeof event),
  ).rejects.toThrow('MONITORING_INVALID_EVENT');
  expect(request).not.toHaveBeenCalled();
});

it.each([429, 500])(
  'opens the session circuit after HTTP %i without retry',
  async (status) => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue({ ok: false, status } as Response);
    let time = 0;
    const monitor = createErrorMonitoring(
      config,
      createSentryTransport(config, request),
      () => time,
    );
    expect(await monitor.report({ code: 'APP_FONT_LOAD_FAILED' })).toBe(false);
    time = 60000;
    expect(await monitor.report({ code: 'APP_FONT_LOAD_FAILED' })).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  },
);

it('isolates rejected fetch', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockRejectedValue(new Error(secret));
  const monitor = createErrorMonitoring(
    config,
    createSentryTransport(config, request),
  );
  expect(await monitor.report({ code: 'APP_FONT_LOAD_FAILED' })).toBe(false);
  expect(request).toHaveBeenCalledTimes(1);
});

it('aborts a stalled request after five seconds and does not retry', async () => {
  jest.useFakeTimers();
  try {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () =>
              reject(new Error('ABORTED')),
            );
          }),
      );
    const monitor = createErrorMonitoring(
      config,
      createSentryTransport(config, request),
    );
    const result = monitor.report({ code: 'APP_FONT_LOAD_FAILED' });
    await jest.advanceTimersByTimeAsync(5000);
    expect(await result).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

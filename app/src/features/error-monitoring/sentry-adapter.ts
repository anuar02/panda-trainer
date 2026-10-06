import { randomUUID } from 'expo-crypto';
import { ReactNativeClient } from '@sentry/react-native/dist/js/client';
import { SDK_NAME, SDK_VERSION } from '@sentry/react-native/dist/js/version';
import type { MonitoringTransport } from './contract';
import { sanitizeTransportEvent, validateConfig } from './privacy';

export function createSentryTransport(
  input: unknown,
  request: typeof fetch = fetch,
): MonitoringTransport {
  const config = validateConfig(input);
  if (!config) return async () => {};
  const dsn = new URL(config.dsn);
  const endpoint = `https://${dsn.hostname}/api${dsn.pathname}/envelope/?sentry_version=7&sentry_key=${dsn.username}`;
  const client = new ReactNativeClient({
    dsn: config.dsn,
    enabled: true,
    integrations: [],
    stackParser: () => [],
    sendDefaultPii: false,
    sendClientReports: false,
    enableNative: false,
    enableNativeCrashHandling: false,
    enableNativeNagger: false,
    enableNdk: false,
    enableNdkScopeSync: false,
    enableAutoSessionTracking: false,
    enableAppHangTracking: false,
    enableCaptureFailedRequests: false,
    enableNativeFramesTracking: false,
    attachStacktrace: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableLogs: false,
    enableMetrics: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    maxBreadcrumbs: 0,
    debug: false,
    transport: () => ({
      async send(envelope) {
        if (envelope[1].length !== 1)
          throw new Error('MONITORING_INVALID_ENVELOPE');
        const item = envelope[1][0];
        const event =
          item?.[0].type === 'event'
            ? sanitizeTransportEvent(item[1], config)
            : null;
        if (!event) throw new Error('MONITORING_INVALID_EVENT');
        const body = [
          JSON.stringify({
            event_id: randomUUID().replace(/-/g, ''),
            sent_at: new Date().toISOString(),
            sdk: {
              name: SDK_NAME,
              version: SDK_VERSION,
              settings: { infer_ip: 'never' },
            },
          }),
          JSON.stringify({ type: 'event' }),
          JSON.stringify(event),
        ].join('\n');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await request(endpoint, {
            method: 'POST',
            body,
            headers: { 'Content-Type': 'application/x-sentry-envelope' },
            credentials: 'omit',
            redirect: 'error',
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('MONITORING_DELIVERY_FAILED');
          return { statusCode: response.status };
        } finally {
          clearTimeout(timeout);
        }
      },
      flush: async () => true,
    }),
  });
  return async (input) => {
    const event = sanitizeTransportEvent(input, config);
    if (!event) throw new Error('MONITORING_INVALID_EVENT');
    const transport = client.getTransport();
    if (!transport) throw new Error('MONITORING_TRANSPORT_UNAVAILABLE');
    await transport.send([
      {
        event_id: randomUUID().replace(/-/g, ''),
        sent_at: new Date().toISOString(),
      },
      [[{ type: 'event' }, event]],
    ]);
  };
}

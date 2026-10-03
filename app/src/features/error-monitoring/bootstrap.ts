import { Platform } from 'react-native';
import { createErrorMonitoring } from './monitor';
import { validateConfig } from './privacy';
import type { MonitoringTransport } from './contract';

let monitoring: ReturnType<typeof createErrorMonitoring> | undefined;

export function bootstrapErrorMonitoring() {
  if (monitoring) return monitoring;
  const input = {
    enabled: process.env.EXPO_PUBLIC_ERROR_MONITORING_ENABLED === 'true',
    optIn: process.env.EXPO_PUBLIC_ERROR_MONITORING_OPT_IN === 'true',
    region: process.env.EXPO_PUBLIC_SENTRY_REGION,
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    release: process.env.EXPO_PUBLIC_ERROR_MONITORING_RELEASE,
    environment: process.env.EXPO_PUBLIC_ERROR_MONITORING_ENVIRONMENT,
    platform: Platform.OS,
  };
  let transport: MonitoringTransport | undefined;
  monitoring = createErrorMonitoring(input, async (event) => {
    if (!validateConfig(input)) return;
    if (!transport) {
      const adapter = await import('./sentry-adapter');
      transport = adapter.createSentryTransport(input);
    }
    await transport(event);
  });
  return monitoring;
}

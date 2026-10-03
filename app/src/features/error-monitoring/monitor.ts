import type { ErrorMonitoring, MonitoringTransport } from './contract';
import { sanitizeEvent, validateConfig } from './privacy';

export const MAX_SESSION_EVENTS = 5;
export const MIN_EVENT_INTERVAL_MS = 60000;

export function createErrorMonitoring(
  input: unknown,
  transport: MonitoringTransport,
  now: () => number = Date.now,
): ErrorMonitoring {
  const config = validateConfig(input);
  let failed = false;
  let reporting = false;
  let attempts = 0;
  let lastAttempt: number | undefined;
  return {
    async report(input) {
      if (!config || failed || reporting || attempts >= MAX_SESSION_EVENTS)
        return false;
      try {
        const event = sanitizeEvent(input, config);
        if (!event) return false;
        const time = now();
        if (
          !Number.isFinite(time) ||
          (lastAttempt !== undefined &&
            time - lastAttempt < MIN_EVENT_INTERVAL_MS)
        )
          return false;
        attempts += 1;
        lastAttempt = time;
        reporting = true;
        await transport(event);
        return true;
      } catch {
        failed = true;
        return false;
      } finally {
        reporting = false;
      }
    },
  };
}

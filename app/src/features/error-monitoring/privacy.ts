import type { MonitoringConfig, SafeEvent, SafeFrame } from './contract';

export const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function validateConfig(input: unknown): MonitoringConfig | null {
  try {
    const source = record(input);
    if (!source) return null;
    const config = {
      enabled: source.enabled,
      optIn: source.optIn,
      region: source.region,
      dsn: source.dsn,
      release: source.release,
      environment: source.environment,
      platform: source.platform,
    };
    if (
      !config ||
      config.enabled !== true ||
      config.optIn !== true ||
      config.region !== 'eu' ||
      typeof config.dsn !== 'string' ||
      !/^https:\/\/[a-f0-9]{32}@o[0-9]+\.ingest\.de\.sentry\.io\/[1-9][0-9]*$/.test(
        config.dsn,
      ) ||
      typeof config.release !== 'string' ||
      !/^panda-trainer@\d{1,3}\.\d{1,3}\.\d{1,3}\+[a-f0-9]{7,40}$/.test(
        config.release,
      ) ||
      (config.environment !== 'pilot-synthetic' &&
        config.environment !== 'pilot') ||
      (config.platform !== 'ios' &&
        config.platform !== 'android' &&
        config.platform !== 'web')
    )
      return null;
    return {
      dsn: config.dsn,
      region: 'eu',
      release: config.release,
      environment: config.environment,
      platform: config.platform,
    };
  } catch {
    return null;
  }
}

export function sanitizeEvent(
  input: unknown,
  config: MonitoringConfig,
): SafeEvent | null {
  try {
    const source = record(input);
    if (source?.code !== 'APP_FONT_LOAD_FAILED') return null;
    const frames: SafeFrame[] = [];
    const inputFrames = source.frames;
    if (Array.isArray(inputFrames)) {
      for (const candidate of inputFrames.slice(0, 8)) {
        const frame = record(candidate);
        const lineno = frame?.lineno;
        if (
          frame?.filename === 'app/app/_layout.tsx' &&
          frame.function === 'RootLayout' &&
          typeof lineno === 'number' &&
          Number.isInteger(lineno) &&
          lineno > 0 &&
          lineno <= 100000
        )
          frames.push({
            filename: 'app/app/_layout.tsx',
            function: 'RootLayout',
            lineno,
          });
      }
    }
    return {
      message: 'APP_FONT_LOAD_FAILED',
      level: 'error',
      release: config.release,
      environment: config.environment,
      tags: { platform: config.platform },
      ...(frames.length
        ? {
            exception: {
              values: [
                {
                  type: 'AppError',
                  value: 'APP_FONT_LOAD_FAILED',
                  stacktrace: { frames },
                },
              ],
            },
          }
        : {}),
    };
  } catch {
    return null;
  }
}

export function sanitizeTransportEvent(
  input: unknown,
  config: MonitoringConfig,
): SafeEvent | null {
  try {
    const event = record(input);
    const exception = record(event?.exception);
    const values = exception?.values;
    const first = Array.isArray(values) ? record(values[0]) : null;
    const stacktrace = record(first?.stacktrace);
    return sanitizeEvent(
      { code: event?.message, frames: stacktrace?.frames },
      config,
    );
  } catch {
    return null;
  }
}

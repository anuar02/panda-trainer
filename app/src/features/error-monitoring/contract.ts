export type MonitoringConfig = Readonly<{
  dsn: string;
  region: 'eu';
  release: string;
  environment: 'pilot-synthetic' | 'pilot';
  platform: 'ios' | 'android' | 'web';
}>;

export type MonitoringOptions =
  | Readonly<{ enabled: false }>
  | Readonly<MonitoringConfig & { enabled: true; optIn: true }>;

export type ErrorCode = 'APP_FONT_LOAD_FAILED';

export type SafeFrame = Readonly<{
  filename: 'app/app/_layout.tsx';
  function: 'RootLayout';
  lineno: number;
}>;

export type SafeEvent = Readonly<{
  message: ErrorCode;
  level: 'error';
  release: string;
  environment: MonitoringConfig['environment'];
  tags: Readonly<{ platform: MonitoringConfig['platform'] }>;
  exception?: Readonly<{
    values: Readonly<{
      type: 'AppError';
      value: ErrorCode;
      stacktrace: Readonly<{ frames: SafeFrame[] }>;
    }>[];
  }>;
}>;

export type MonitoringTransport = (event: SafeEvent) => Promise<void>;
export type ErrorMonitoring = Readonly<{
  report: (input: unknown) => Promise<boolean>;
}>;

export const notificationKinds = [
  'booking_reminder',
  'daily_plan',
  'booking_requested',
  'booking_confirmed',
  'booking_cancelled',
  'booking_rescheduled',
  'reschedule_requested',
  'reschedule_declined',
  'reschedule_withdrawn',
  'workout_finished',
  'workout_corrected',
] as const;
export type NotificationKind = (typeof notificationKinds)[number];
export type NotificationRow = {
  id: string;
  workspace_id: string;
  recipient_user_id: string;
  recipient_role: 'trainer' | 'client';
  client_record_id: string;
  event_key: string;
  kind: NotificationKind;
  target_type: 'booking' | 'workout';
  target_id: string;
  payload: { version: 1 };
  created_at: string;
  read_at: string | null;
};
export type NotificationCursor = { at: string; id: string };
export type NotificationPage = {
  rows: NotificationRow[];
  has_more: boolean;
  unread_count: number;
};
export type NotificationScope = {
  userId: string;
  workspaceId: string;
  clientRecordId?: string;
  role: 'trainer' | 'client';
  token: string;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
};
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const date = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT/.test(value) &&
  Number.isFinite(Date.parse(value));
export const notificationFailure = () => new Error('Notification unavailable');
export function notificationRow(
  value: unknown,
  scope: NotificationScope,
): NotificationRow {
  if (
    !record(value) ||
    !uuid(value.id) ||
    value.workspace_id !== scope.workspaceId ||
    value.recipient_user_id !== scope.userId ||
    value.recipient_role !== scope.role ||
    !uuid(value.client_record_id) ||
    (scope.clientRecordId && value.client_record_id !== scope.clientRecordId) ||
    typeof value.event_key !== 'string' ||
    !value.event_key ||
    value.event_key.length > 200 ||
    !notificationKinds.some((kind) => kind === value.kind) ||
    !['booking', 'workout'].includes(String(value.target_type)) ||
    !uuid(value.target_id) ||
    (value.target_type === 'workout') !==
      (value.kind === 'workout_finished' ||
        value.kind === 'workout_corrected') ||
    !record(value.payload) ||
    value.payload.version !== 1 ||
    Object.keys(value.payload).length !== 1 ||
    !date(value.created_at) ||
    (value.read_at !== null && !date(value.read_at))
  )
    throw notificationFailure();
  notificationOrderKey(value.created_at);
  const expected = [
    'id',
    'workspace_id',
    'recipient_user_id',
    'recipient_role',
    'client_record_id',
    'event_key',
    'kind',
    'target_type',
    'target_id',
    'payload',
    'created_at',
    'read_at',
  ];
  if (Object.keys(value).some((key) => !expected.includes(key)))
    throw notificationFailure();
  return value as NotificationRow;
}
export function notificationPage(
  value: unknown,
  scope: NotificationScope,
): NotificationPage {
  if (
    !record(value) ||
    !Array.isArray(value.rows) ||
    value.rows.length > 50 ||
    typeof value.has_more !== 'boolean' ||
    (value.has_more && !value.rows.length) ||
    !Number.isSafeInteger(value.unread_count) ||
    Number(value.unread_count) < 0
  )
    throw notificationFailure();
  const rows = value.rows.map((row) => notificationRow(row, scope));
  if (
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    rows.some(
      (row, index) =>
        index > 0 && compareNotifications(rows[index - 1]!, row) >= 0,
    )
  )
    throw notificationFailure();
  return {
    rows,
    has_more: value.has_more,
    unread_count: Number(value.unread_count),
  };
}
export function notificationOrderKey(timestamp: string) {
  const utc =
    /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(
      timestamp,
    );
  if (!utc) throw notificationFailure();
  return `${utc[1]}.${(utc[2] ?? '').padEnd(6, '0')}`;
}
export function compareNotifications(a: NotificationRow, b: NotificationRow) {
  return (
    notificationOrderKey(b.created_at).localeCompare(
      notificationOrderKey(a.created_at),
    ) || b.id.localeCompare(a.id)
  );
}
export function mergeNotifications(
  previous: readonly NotificationRow[],
  next: readonly NotificationRow[],
) {
  const merged = new Map(previous.map((row) => [row.id, row]));
  for (const row of next) {
    const before = merged.get(row.id);
    merged.set(row.id, { ...row, read_at: before?.read_at ?? row.read_at });
  }
  return [...merged.values()].sort(compareNotifications);
}

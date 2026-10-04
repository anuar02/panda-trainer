const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
export function pushOpenPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.version !== 1 ||
    !uuid(row.notificationId) ||
    !uuid(row.workspaceId) ||
    Object.keys(row).some(
      (key) => !['version', 'notificationId', 'workspaceId'].includes(key),
    )
  )
    return null;
  return { notificationId: row.notificationId, workspaceId: row.workspaceId };
}

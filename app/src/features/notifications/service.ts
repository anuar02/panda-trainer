import { withOnboardingSession } from '@/features/onboarding/session';
import {
  notificationFailure,
  notificationOrderKey,
  notificationPage,
  notificationRow,
  type NotificationCursor,
  type NotificationScope,
} from '@/domain/notifications';
export const notificationService = {
  async page(scope: NotificationScope, cursor: NotificationCursor | null) {
    return withOnboardingSession(scope, async (read) => {
      const result = await read.client
        .rpc('notification_feed', {
          p_workspace_id: scope.workspaceId,
          p_client_record_id: scope.clientRecordId ?? undefined,
          p_before_at: cursor?.at,
          p_before_id: cursor?.id,
          p_limit: 50,
        })
        .setHeader('Authorization', `Bearer ${read.token}`)
        .abortSignal(read.signal);
      await read.guard();
      if (result.error) throw notificationFailure();
      const page = notificationPage(result.data, scope);
      if (
        cursor &&
        page.rows.some(
          (row) =>
            notificationOrderKey(row.created_at).localeCompare(
              notificationOrderKey(cursor.at),
            ) > 0 ||
            (notificationOrderKey(row.created_at) ===
              notificationOrderKey(cursor.at) &&
              row.id.localeCompare(cursor.id) >= 0),
        )
      )
        throw notificationFailure();
      return page;
    });
  },
  async mark(scope: NotificationScope, id: string) {
    return withOnboardingSession(scope, async (read) => {
      const result = await read.client
        .rpc('mark_notification_read', {
          p_workspace_id: scope.workspaceId,
          p_notification_id: id,
        })
        .setHeader('Authorization', `Bearer ${read.token}`)
        .abortSignal(read.signal);
      await read.guard();
      if (result.error) throw notificationFailure();
      const row = notificationRow(result.data, scope);
      if (row.id !== id || !row.read_at) throw notificationFailure();
      return row;
    });
  },
  async target(scope: NotificationScope, id: string) {
    return withOnboardingSession(scope, async (read) => {
      const result = await read.client
        .rpc('notification_target', {
          p_workspace_id: scope.workspaceId,
          p_notification_id: id,
        })
        .setHeader('Authorization', `Bearer ${read.token}`)
        .abortSignal(read.signal);
      await read.guard();
      const value = result.data;
      if (
        result.error ||
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        typeof value.available !== 'boolean' ||
        !['booking', 'workout'].includes(String(value.target_type)) ||
        typeof value.target_id !== 'string' ||
        typeof value.client_record_id !== 'string' ||
        (scope.clientRecordId &&
          value.client_record_id !== scope.clientRecordId)
      )
        throw notificationFailure();
      const details =
        value.current &&
        typeof value.current === 'object' &&
        !Array.isArray(value.current)
          ? value.current
          : null;
      return {
        current:
          details &&
          typeof details.status === 'string' &&
          typeof details.date === 'string' &&
          typeof details.starts_at === 'string'
            ? {
                status: details.status,
                date: details.date,
                startsAt: details.starts_at,
              }
            : null,
        available: value.available,
        type: value.target_type as 'booking' | 'workout',
        id: value.target_id,
        clientRecordId: value.client_record_id,
      };
    });
  },
};

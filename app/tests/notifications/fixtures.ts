import type {
  NotificationRow,
  NotificationScope,
} from '@/domain/notifications';
import { clientReadToken } from '../client-read-auth-fixture';
export const userId = '59000000-0000-4000-8000-000000000002';
export const workspaceId = '69000000-0000-4000-8000-000000000001';
export const cardId = '79000000-0000-4000-8000-000000000001';
export const scope: NotificationScope = {
  userId,
  workspaceId,
  clientRecordId: cardId,
  role: 'client',
  token: clientReadToken(userId),
};
export const row = (index = 1, read = false): NotificationRow => ({
  id: `89000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  workspace_id: workspaceId,
  recipient_user_id: userId,
  recipient_role: 'client',
  client_record_id: cardId,
  event_key: `booking:${index}:1`,
  kind: 'booking_confirmed',
  target_type: 'booking',
  target_id: '99000000-0000-4000-8000-000000000001',
  payload: { version: 1 },
  created_at: `2026-10-04T10:00:${String(index).padStart(2, '0')}.000000+00:00`,
  read_at: read ? '2026-10-04T11:00:00Z' : null,
});
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export const page = (rows = [row()], unread = 1, more = false) => ({
  rows,
  unread_count: unread,
  has_more: more,
});

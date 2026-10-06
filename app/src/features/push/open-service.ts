import {
  withOnboardingSession,
  type OnboardingScope,
} from '@/features/onboarding/session';
import { pushOpenPayload } from './routing';
export type PushDestination = {
  role: 'client' | 'trainer';
  kind: string;
  clientRecordId: string;
  bookingId: string;
  date: string;
  cancelled: boolean;
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export async function openPush(
  scope: OnboardingScope,
  payload: NonNullable<ReturnType<typeof pushOpenPayload>>,
): Promise<PushDestination | null> {
  return withOnboardingSession(scope, async (read) => {
    const result = await read.client
      .rpc('open_push_notification', {
        p_workspace_id: payload.workspaceId,
        p_notification_id: payload.notificationId,
      })
      .setHeader('Authorization', `Bearer ${read.token}`)
      .abortSignal(read.signal);
    await read.guard();
    if (result.error?.code === 'P0002' || result.error?.code === '42501')
      return null;
    const value = result.data;
    if (
      result.error ||
      !object(value) ||
      !['trainer', 'client'].includes(String(value.role)) ||
      typeof value.kind !== 'string' ||
      !object(value.target)
    )
      throw new Error('Push unavailable');
    const target = value.target;
    if (target.available === false) return null;
    if (
      target.available !== true ||
      target.target_type !== 'booking' ||
      typeof target.client_record_id !== 'string' ||
      typeof target.target_id !== 'string' ||
      !object(target.current) ||
      typeof target.current.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(target.current.date) ||
      typeof target.current.status !== 'string'
    )
      throw new Error('Push unavailable');
    if (
      !pushOpenPayload({
        version: 1,
        notificationId: target.target_id,
        workspaceId: target.client_record_id,
      })
    )
      throw new Error('Push unavailable');
    return {
      role: value.role as 'client' | 'trainer',
      kind: value.kind,
      clientRecordId: target.client_record_id,
      bookingId: target.target_id,
      date: target.current.date,
      cancelled:
        value.kind !== 'daily_plan' &&
        target.current.status.startsWith('cancelled'),
    };
  });
}

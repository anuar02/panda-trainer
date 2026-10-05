import { getSupabaseClient } from '@/features/auth/client';
import type { SyncSession } from '@/domain/workout-sync/types';
import { createWorkspaceScheduleReadFence } from './read-session';
import { scheduleUuidPattern } from './read-validation';

export async function loadTodayFinishedBookingIds(
  session: SyncSession,
  bookingIds: readonly string[],
  isCurrent: () => boolean,
): Promise<ReadonlySet<string>> {
  const ids = [...new Set(bookingIds)];
  if (
    !scheduleUuidPattern.test(session.workspaceId) ||
    ids.length > 10_000 ||
    ids.some((id) => !scheduleUuidPattern.test(id))
  )
    throw new Error('Invalid Today journal scope');
  const client = getSupabaseClient();
  if (!client) throw new Error('Today journal reader unavailable');
  const fence = await createWorkspaceScheduleReadFence(
    client.auth,
    { userId: session.accountId, workspaceId: session.workspaceId },
    isCurrent,
  );
  const finished = new Set<string>();
  try {
    for (let offset = 0; offset < ids.length; offset += 200) {
      const batch = ids.slice(offset, offset + 200);
      const requested = new Set(batch);
      for (let page = 0; page < 20; page += 1) {
        await fence.assertCurrent();
        const result = await client
          .from('workout_instances')
          .select('booking_id,workspace_id,finished_at')
          .eq('workspace_id', session.workspaceId)
          .in('booking_id', batch)
          .not('finished_at', 'is', null)
          .order('id')
          .range(page * 500, page * 500 + 499);
        await fence.assertCurrent();
        const rows: unknown = result.data;
        if (result.error || !Array.isArray(rows) || rows.length > 500)
          throw new Error('Today journals could not be loaded');
        for (const value of rows as unknown[]) {
          if (typeof value !== 'object' || value === null)
            throw new Error('Invalid Today journal row');
          const row = value as Record<string, unknown>;
          if (
            typeof row.booking_id !== 'string' ||
            !requested.has(row.booking_id) ||
            row.workspace_id !== session.workspaceId ||
            typeof row.finished_at !== 'string' ||
            !Number.isFinite(Date.parse(row.finished_at))
          )
            throw new Error('Invalid Today journal row');
          finished.add(row.booking_id);
        }
        if (rows.length < 500) break;
        if (page === 19) throw new Error('Today journal read limit exceeded');
      }
    }
    await fence.assertCurrent();
    return finished;
  } finally {
    fence.dispose();
  }
}

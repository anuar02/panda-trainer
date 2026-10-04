import type { SchedulingCommandFence } from './command-session';
import { WorkspaceSchedulingError } from './service';

export async function assertSchedulingCommandTarget(
  fence: SchedulingCommandFence,
  workspaceId: string,
  bookingId: string,
  proposalId?: string,
  clientRecordId?: string,
) {
  try {
    await fence.assertCurrent();
    const booking = await fence.client
      .from('bookings')
      .select('id,workspace_id,client_record_id')
      .eq('id', bookingId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
      .setHeader('Authorization', `Bearer ${fence.accessToken}`);
    await fence.assertCurrent();
    if (
      booking.error ||
      !booking.data ||
      booking.data.id !== bookingId ||
      booking.data.workspace_id !== workspaceId.toLowerCase() ||
      (clientRecordId &&
        booking.data.client_record_id !== clientRecordId.toLowerCase())
    )
      throw new WorkspaceSchedulingError('unavailable');
    if (proposalId) {
      const proposal = await fence.client
        .from('schedule_proposals')
        .select('id,workspace_id,booking_id')
        .eq('id', proposalId)
        .eq('workspace_id', workspaceId)
        .eq('booking_id', bookingId)
        .maybeSingle()
        .setHeader('Authorization', `Bearer ${fence.accessToken}`);
      await fence.assertCurrent();
      if (
        proposal.error ||
        !proposal.data ||
        proposal.data.id !== proposalId ||
        proposal.data.workspace_id !== workspaceId.toLowerCase() ||
        proposal.data.booking_id !== bookingId
      )
        throw new WorkspaceSchedulingError('unavailable');
    }
  } catch (error) {
    await fence.assertCurrent();
    if (error instanceof WorkspaceSchedulingError) throw error;
    throw new WorkspaceSchedulingError('request');
  }
}

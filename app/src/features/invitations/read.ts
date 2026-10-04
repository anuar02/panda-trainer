import {
  parsePerson,
  personColumns,
  timestamp,
} from '@/features/workspace-clients/read-validation';
import { createInvitationFence, type InvitationScope } from './session';

const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
const failure = () => new Error('Invitation data unavailable');
export async function loadTrainerInvitation(scope: InvitationScope) {
  if (!uuid(scope.workspaceId) || !uuid(scope.clientRecordId)) throw failure();
  const fence = createInvitationFence(scope);
  try {
    await fence.verify();
    const owner = await fence.client
      .from('trainer_workspaces')
      .select('id,owner_user_id')
      .eq('id', scope.workspaceId)
      .eq('owner_user_id', scope.userId)
      .setHeader('Authorization', `Bearer ${fence.bearer}`)
      .abortSignal(fence.signal)
      .maybeSingle();
    await fence.guard();
    if (
      owner.error ||
      owner.data?.id !== scope.workspaceId ||
      owner.data.owner_user_id !== scope.userId
    )
      throw failure();
    const person = await fence.client
      .from('client_records')
      .select(personColumns)
      .eq('workspace_id', scope.workspaceId)
      .eq('id', scope.clientRecordId)
      .is('archived_at', null)
      .setHeader('Authorization', `Bearer ${fence.bearer}`)
      .abortSignal(fence.signal)
      .maybeSingle();
    await fence.guard();
    if (person.error || !person.data) throw failure();
    const client = parsePerson(person.data, scope.workspaceId);
    if (
      client.id !== scope.clientRecordId ||
      client.archived_at !== null ||
      /[\u0000-\u001f\u007f]/.test(client.display_name)
    )
      throw failure();
    const result = await fence.client
      .from('invitations')
      .select('id,client_record_id,expires_at,accepted_at,revoked_at')
      .eq('client_record_id', scope.clientRecordId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .setHeader('Authorization', `Bearer ${fence.bearer}`)
      .abortSignal(fence.signal)
      .maybeSingle();
    await fence.guard();
    if (result.error) throw failure();
    const row = result.data;
    if (
      row &&
      (!uuid(row.id) ||
        row.client_record_id !== scope.clientRecordId ||
        !timestamp(row.expires_at) ||
        (row.accepted_at !== null && !timestamp(row.accepted_at)) ||
        (row.revoked_at !== null && !timestamp(row.revoked_at)))
    )
      throw failure();
    return { client, invitation: row };
  } catch {
    await fence.guard();
    throw failure();
  } finally {
    fence.dispose();
  }
}

import { getSupabaseClient } from '@/features/auth/client';
import type { Database } from '@/lib/database.types';
import type { WorkspaceClientDetailsData } from './details-screen';

export type WorkspaceClient =
  Database['public']['Tables']['client_records']['Row'] & {
    programName: string | null;
    nextStartsAt: string | null;
    nextIsGroup: boolean;
  };

export async function loadWorkspaceClients(
  workspaceId: string,
): Promise<WorkspaceClient[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Client data is unavailable');
  const [people, programs, bookings] = await Promise.all([
    client
      .from('client_records')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('archived_at', null),
    client
      .from('client_programs')
      .select('client_record_id,name,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
    client
      .from('bookings')
      .select('client_record_id,starts_at,group_session_id')
      .eq('workspace_id', workspaceId)
      .in('status', ['proposed', 'confirmed'])
      .gte('ends_at', new Date().toISOString())
      .order('starts_at'),
  ]);
  if (people.error || programs.error || bookings.error)
    throw new Error('Client data could not be loaded');
  return people.data.map((person) => {
    const program = programs.data.find(
      (value) => value.client_record_id === person.id,
    );
    const booking = bookings.data.find(
      (value) => value.client_record_id === person.id,
    );
    return {
      ...person,
      programName: program?.name ?? null,
      nextStartsAt: booking?.starts_at ?? null,
      nextIsGroup:
        booking?.group_session_id !== null &&
        booking?.group_session_id !== undefined,
    };
  });
}

export async function createWorkspaceClient(name: string, requestId: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Client creation is unavailable');
  const { error } = await client.rpc('create_client_record', {
    client_name: name.trim(),
    client_phone: '',
    request_id: requestId,
  });
  if (error) throw new Error('Client could not be created');
}

export async function loadWorkspaceClientDetails(
  workspaceId: string,
  clientId: string,
): Promise<WorkspaceClientDetailsData | null> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Client data is unavailable');
  const person = await client
    .from('client_records')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', clientId)
    .is('archived_at', null)
    .maybeSingle();
  if (person.error) throw new Error('Client data could not be loaded');
  if (!person.data) return null;
  const [program, bookings] = await Promise.all([
    client
      .from('client_programs')
      .select(
        'id,workspace_id,client_record_id,base_template_id,base_template_revision,name,description,revision,created_at,updated_at',
      )
      .eq('workspace_id', workspaceId)
      .eq('client_record_id', clientId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('bookings')
      .select(
        'id,workspace_id,client_record_id,group_session_id,starts_at,ends_at,status,revision,created_at,updated_at',
      )
      .eq('workspace_id', workspaceId)
      .eq('client_record_id', clientId)
      .order('starts_at', { ascending: false }),
  ]);
  if (program.error || bookings.error)
    throw new Error('Client data could not be loaded');
  const items = program.data
    ? await client
        .from('client_program_exercises')
        .select(
          'id,workspace_id,client_program_id,exercise_id,exercise_name_snapshot,source_key_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,note,revision,created_at,updated_at',
        )
        .eq('workspace_id', workspaceId)
        .eq('client_program_id', program.data.id)
        .order('position')
    : null;
  if (items?.error) throw new Error('Program data could not be loaded');
  return {
    client: person.data,
    program: program.data
      ? { ...program.data, items: items?.data ?? [] }
      : null,
    bookings: bookings.data,
  };
}

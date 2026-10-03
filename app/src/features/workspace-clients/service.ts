import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import type { Database } from '@/lib/database.types';
import type { WorkspaceClientDetailsData } from './details-screen';
import {
  ClientReadError,
  uuid,
  record,
  fail,
  personColumns,
  programColumns,
  bookingColumns,
  exerciseColumns,
  parsePerson,
  parseProgram,
  parseBooking,
  parseExercise,
} from './read-validation';

export type WorkspaceClient =
  Database['public']['Tables']['client_records']['Row'] & {
    programName: string | null;
    nextStartsAt: string | null;
    nextIsGroup: boolean;
  };
export type ClientReadScope = {
  userId: string;
  token: string;
  signal?: AbortSignal;
};
const pageSize = 200;
const rowLimit = 10000;
type Read = {
  client: SupabaseClient<Database>;
  token: string;
  signal: AbortSignal;
  guard(): Promise<void>;
};
async function withRead<T>(
  workspaceId: string,
  scope: ClientReadScope | undefined,
  load: (read: Read) => Promise<T>,
): Promise<T> {
  if (!uuid(workspaceId) || (scope && (!uuid(scope.userId) || !scope.token)))
    throw new ClientReadError('invalidInput');
  const client = getSupabaseClient();
  if (!client) throw new ClientReadError('unavailable');
  const abort = new AbortController();
  let invalid = false;
  let actor: string | undefined;
  let liveToken: string | undefined;
  const cancel = () => {
    invalid = true;
    abort.abort();
  };
  scope?.signal?.addEventListener('abort', cancel);
  if (scope?.signal?.aborted) cancel();
  const { data: listener } = client.auth.onAuthStateChange((event, session) => {
    if (
      event === 'SIGNED_OUT' ||
      !session ||
      (actor && session.user.id !== actor)
    )
      cancel();
    else if (event === 'TOKEN_REFRESHED' && actor === session.user.id)
      liveToken = session.access_token;
    else if (event !== 'INITIAL_SESSION' && session.access_token !== liveToken)
      cancel();
  });
  const guard = async () => {
    if (invalid) throw new ClientReadError('sessionChanged');
    const result = await client.auth.getSession();
    if (
      invalid ||
      result.error ||
      result.data.session?.user.id !== actor ||
      result.data.session?.access_token !== liveToken
    )
      throw new ClientReadError('sessionChanged');
  };
  try {
    const before = await client.auth.getSession();
    const session = before.data.session;
    if (
      invalid ||
      before.error ||
      !session ||
      !uuid(session.user.id) ||
      !session.access_token ||
      (scope &&
        (session.user.id !== scope.userId ||
          session.access_token !== scope.token))
    )
      throw new ClientReadError('sessionChanged');
    actor = session.user.id;
    liveToken = session.access_token;
    const read = {
      client,
      token: session.access_token,
      signal: abort.signal,
      guard,
    };
    await guard();
    const owner = await client
      .from('trainer_workspaces')
      .select('id,owner_user_id')
      .eq('id', workspaceId)
      .eq('owner_user_id', actor)
      .setHeader('Authorization', `Bearer ${read.token}`)
      .abortSignal(read.signal)
      .maybeSingle();
    await guard();
    if (
      owner.error ||
      !owner.data ||
      owner.data.id !== workspaceId ||
      owner.data.owner_user_id !== actor
    )
      throw new ClientReadError('unavailable');
    const result = await load(read);
    await guard();
    return result;
  } finally {
    listener.subscription.unsubscribe();
    scope?.signal?.removeEventListener('abort', cancel);
    abort.abort();
  }
}
type Table =
  | 'client_records'
  | 'client_programs'
  | 'bookings'
  | 'client_program_exercises';
async function rows<T extends { id: string }>(
  read: Read,
  table: Table,
  columns: string,
  workspaceId: string,
  parse: (value: unknown) => T,
  orders: [string, boolean][],
  filters: { clientId?: string; programId?: string; upcoming?: string } = {},
): Promise<T[]> {
  const output: T[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  for (let offset = 0; offset <= rowLimit; offset += pageSize) {
    await read.guard();
    let query = read.client
      .from(table)
      .select(columns, { count: 'exact' })
      .eq('workspace_id', workspaceId);
    if (filters.clientId)
      query = query.filter('client_record_id', 'eq', filters.clientId);
    if (filters.programId)
      query = query.filter('client_program_id', 'eq', filters.programId);
    if (filters.upcoming)
      query = query
        .in('status', ['proposed', 'confirmed'])
        .gte('ends_at', filters.upcoming);
    for (const [column, ascending] of orders)
      query = query.order(column, { ascending });
    const response = await query
      .range(offset, offset + pageSize - 1)
      .setHeader('Authorization', `Bearer ${read.token}`)
      .abortSignal(read.signal);
    await read.guard();
    if (response.error) throw new ClientReadError('unavailable');
    const count = response.count;
    if (
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      (total !== undefined && total !== count) ||
      !Array.isArray(response.data)
    )
      return fail();
    if (count > rowLimit) throw new ClientReadError('limit');
    total = count;
    if (
      response.data.length !== Math.min(pageSize, Math.max(0, count - offset))
    )
      return fail();
    for (const value of response.data as unknown[]) {
      const item = parse(value);
      if (ids.has(item.id)) return fail();
      ids.add(item.id);
      const previous = output.at(-1);
      if (previous) {
        const a = record(previous);
        const b = record(item);
        let comparison = 0;
        for (const [column, ascending] of orders) {
          const left = a[column];
          const right = b[column];
          if (
            (typeof left !== 'string' && typeof left !== 'number') ||
            typeof right !== typeof left
          )
            return fail();
          const l = column.endsWith('_at') ? Date.parse(String(left)) : left;
          const r = column.endsWith('_at')
            ? Date.parse(String(right))
            : (right as string | number);
          if (l !== r) {
            comparison = (l < r ? -1 : 1) * (ascending ? 1 : -1);
            break;
          }
        }
        if (comparison >= 0) return fail();
      }
      output.push(item);
    }
    if (output.length === count) return output;
  }
  throw new ClientReadError('limit');
}
export async function loadWorkspaceClients(
  workspaceId: string,
  scope?: ClientReadScope,
): Promise<WorkspaceClient[]> {
  return withRead(workspaceId, scope, async (read) => {
    const now = new Date().toISOString();
    const people = await rows(
      read,
      'client_records',
      personColumns,
      workspaceId,
      (value) => parsePerson(value, workspaceId),
      [['id', true]],
    );
    const clients = new Set(people.map((person) => person.id));
    const programs = await rows(
      read,
      'client_programs',
      programColumns,
      workspaceId,
      (value) => parseProgram(value, workspaceId, clients),
      [
        ['created_at', false],
        ['id', false],
      ],
    );
    const bookings = await rows(
      read,
      'bookings',
      bookingColumns,
      workspaceId,
      (value) => {
        const booking = parseBooking(value, workspaceId, clients);
        if (
          !['proposed', 'confirmed'].includes(booking.status) ||
          Date.parse(booking.ends_at) < Date.parse(now)
        )
          return fail();
        return booking;
      },
      [
        ['starts_at', true],
        ['id', true],
      ],
      { upcoming: now },
    );
    const latest = new Map<string, (typeof programs)[number]>();
    const nearest = new Map<string, (typeof bookings)[number]>();
    for (const program of programs)
      if (!latest.has(program.client_record_id))
        latest.set(program.client_record_id, program);
    for (const booking of bookings)
      if (!nearest.has(booking.client_record_id))
        nearest.set(booking.client_record_id, booking);
    return people
      .filter((person) => person.archived_at === null)
      .map((person) => {
        const program = latest.get(person.id);
        const booking = nearest.get(person.id);
        return {
          ...person,
          programName: program?.name ?? null,
          nextStartsAt: booking?.starts_at ?? null,
          nextIsGroup: booking?.group_session_id != null,
        };
      });
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
  scope?: ClientReadScope,
): Promise<WorkspaceClientDetailsData | null> {
  if (!uuid(clientId)) throw new ClientReadError('invalidInput');
  return withRead(workspaceId, scope, async (read) => {
    await read.guard();
    const person = await read.client
      .from('client_records')
      .select(personColumns)
      .eq('workspace_id', workspaceId)
      .eq('id', clientId)
      .setHeader('Authorization', `Bearer ${read.token}`)
      .abortSignal(read.signal)
      .maybeSingle();
    await read.guard();
    if (person.error) throw new ClientReadError('unavailable');
    if (person.data === null) return null;
    const parsed = parsePerson(person.data, workspaceId);
    if (parsed.id !== clientId) return fail();
    if (parsed.archived_at !== null) return null;
    const clients = new Set([clientId]);
    const programs = await rows(
      read,
      'client_programs',
      programColumns,
      workspaceId,
      (value) => parseProgram(value, workspaceId, clients),
      [
        ['created_at', false],
        ['id', false],
      ],
      { clientId },
    );
    const bookings = await rows(
      read,
      'bookings',
      bookingColumns,
      workspaceId,
      (value) => parseBooking(value, workspaceId, clients),
      [
        ['starts_at', false],
        ['id', false],
      ],
      { clientId },
    );
    const program = programs[0] ?? null;
    const items = program
      ? await rows(
          read,
          'client_program_exercises',
          exerciseColumns,
          workspaceId,
          (value) => parseExercise(value, workspaceId, program.id),
          [
            ['position', true],
            ['id', true],
          ],
          { programId: program.id },
        )
      : [];
    if (
      new Set(items.map((item) => item.position)).size !== items.length ||
      new Set(items.map((item) => item.exercise_id)).size !== items.length
    )
      return fail();
    return {
      client: parsed,
      program: program ? { ...program, items } : null,
      bookings,
    };
  });
}

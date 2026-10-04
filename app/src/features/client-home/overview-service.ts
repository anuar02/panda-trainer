import { getSupabaseClient } from '@/features/auth/client';
import { createProgramReadFence } from '../client-program/program-read-session';
import type { ClientScheduleContext } from '../client-scheduling/service';

export type ClientOverview = {
  context: ClientScheduleContext;
  today: string;
  startsOn: string;
  endsOn: string;
  remainingUnits: string;
  activeUnits: string;
  dueMinor: string;
  visits: { date: string; count: string }[];
};
export type ClientOverviewScope = {
  expectedUserId: string;
  workspaceId: string;
  clientRecordId: string;
  startsOn: string;
  endsOn: string;
  isCurrent?: () => boolean;
};
export class ClientOverviewError extends Error {
  constructor(
    readonly code: 'configuration' | 'invalidInput' | 'unavailable' | 'request',
  ) {
    super('Client overview unavailable');
    this.name = 'ClientOverviewError';
  }
}
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const date = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d\d-\d\d$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const decimal = (v: unknown): v is string =>
  typeof v === 'string' && /^(0|[1-9][0-9]{0,39})$/.test(v);
const fail = (): never => {
  throw new ClientOverviewError('request');
};
export async function loadClientOverview(
  input: ClientOverviewScope,
): Promise<ClientOverview> {
  if (
    !uuid(input.expectedUserId) ||
    !uuid(input.workspaceId) ||
    !uuid(input.clientRecordId) ||
    !date(input.startsOn) ||
    !date(input.endsOn) ||
    input.endsOn <= input.startsOn ||
    Date.parse(input.endsOn) - Date.parse(input.startsOn) > 366 * 86400000
  )
    throw new ClientOverviewError('invalidInput');
  const client = getSupabaseClient();
  if (!client) throw new ClientOverviewError('configuration');
  const fence = await createProgramReadFence(
    client.auth,
    { userId: input.expectedUserId },
    input.isCurrent,
  ).catch(() => {
    throw new ClientOverviewError('unavailable');
  });
  try {
    await fence.assertCurrent();
    const response = await client
      .rpc('get_my_client_overview', {
        p_client_record_id: input.clientRecordId.toLowerCase(),
        p_starts_on: input.startsOn,
        p_ends_on: input.endsOn,
      })
      .setHeader('Authorization', `Bearer ${fence.accessToken}`);
    await fence.assertCurrent();
    if (response.error)
      throw new ClientOverviewError(
        response.error.code === 'P0002' || response.error.code === '42501'
          ? 'unavailable'
          : 'request',
      );
    const row: unknown = response.data;
    if (
      !object(row) ||
      Object.keys(row).sort().join(',') !==
        'active_units,context,due_minor,ends_on,remaining_units,starts_on,today,visits' ||
      !object(row.context)
    )
      return fail();
    const context = row.context;
    if (
      Object.keys(context).sort().join(',') !==
        'client_name,client_record_id,timezone,trainer_name,workspace_id' ||
      context.workspace_id !== input.workspaceId.toLowerCase() ||
      context.client_record_id !== input.clientRecordId.toLowerCase() ||
      typeof context.timezone !== 'string' ||
      typeof context.client_name !== 'string' ||
      typeof context.trainer_name !== 'string' ||
      !date(row.today) ||
      row.starts_on !== input.startsOn ||
      row.ends_on !== input.endsOn ||
      !decimal(row.remaining_units) ||
      !decimal(row.active_units) ||
      !decimal(row.due_minor) ||
      BigInt(row.remaining_units) > BigInt(row.active_units) ||
      !Array.isArray(row.visits) ||
      row.visits.length > 366
    )
      return fail();
    try {
      new Intl.DateTimeFormat('en', { timeZone: context.timezone }).format();
    } catch {
      return fail();
    }
    const dates = new Set<string>();
    const visits = row.visits.map((v: unknown) => {
      if (
        !object(v) ||
        Object.keys(v).sort().join(',') !== 'count,date' ||
        !date(v.date) ||
        v.date < input.startsOn ||
        v.date >= input.endsOn ||
        dates.has(v.date) ||
        !decimal(v.count) ||
        v.count === '0'
      )
        return fail();
      dates.add(v.date);
      return { date: v.date, count: v.count };
    });
    return {
      context: {
        workspaceId: input.workspaceId.toLowerCase(),
        clientRecordId: input.clientRecordId.toLowerCase(),
        timezone: context.timezone,
        clientName: context.client_name,
        trainerName: context.trainer_name,
      },
      today: row.today,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      remainingUnits: row.remaining_units,
      activeUnits: row.active_units,
      dueMinor: row.due_minor,
      visits: visits.sort((a, b) => a.date.localeCompare(b.date)),
    };
  } catch (error: unknown) {
    try {
      await fence.assertCurrent();
    } catch {
      throw new ClientOverviewError('unavailable');
    }
    if (error instanceof ClientOverviewError) throw error;
    throw new ClientOverviewError(
      error instanceof Error && error.name === 'ClientProgramSessionError'
        ? 'unavailable'
        : 'request',
    );
  } finally {
    fence.dispose();
  }
}

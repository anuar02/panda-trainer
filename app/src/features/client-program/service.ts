import { getSupabaseClient } from '@/features/auth/client';
import {
  createProgramReadFence,
  ClientProgramSessionError,
} from './program-read-session';
import type { ClientScheduleContext } from '../client-scheduling/service';

export type ClientPersonalProgramExercise = {
  id: string;
  name: string;
  measure: 'reps' | 'seconds';
  bodyweight: boolean;
  muscleGroup: string;
  equipment: string;
  instructions: string[];
  position: number;
  plannedSets: number;
  plannedReps: string | null;
  plannedSeconds: string | null;
  plannedWeightG: number | null;
  restSeconds: number;
  note: string | null;
  revision: number;
};
export type ClientPersonalProgram = {
  id: string;
  name: string;
  description: string;
  revision: number;
  createdAtUtc: string;
  exercises: ClientPersonalProgramExercise[];
};
export type ClientProgramData = {
  context: ClientScheduleContext;
  program: ClientPersonalProgram | null;
};
export class ClientProgramError extends Error {
  constructor(
    readonly code: 'invalidInput' | 'configuration' | 'unavailable' | 'request',
  ) {
    super('Client program could not be loaded');
    this.name = 'ClientProgramError';
  }
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const integer = (
  value: unknown,
  min: number,
  max = 2147483647,
): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;
const nullableText = (value: unknown): value is string | null =>
  value === null || text(value);
const boundedText = (value: unknown, max: number): value is string =>
  text(value) && [...value].length <= max;
const boundedName = (value: string, max: number) => {
  const name = value.replace(/^ +| +$/g, '');
  return [...name].length >= 1 && [...name].length <= max;
};
const units = (value: unknown, digits: number): value is string | null =>
  value === null ||
  (text(value) &&
    new RegExp(`^[0-9]{1,${digits}}([–-][0-9]{1,${digits}})?$`).test(value));
const timestamp = (value: unknown): value is string => {
  if (
    !text(value) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)
  )
    return false;
  const parsed = Date.parse(value);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19)
  );
};
const fail = (): never => {
  throw new ClientProgramError('request');
};

export async function loadLatestClientProgram(input: {
  expectedUserId: string;
  clientRecordId: string;
  expectedSessionId?: string;
  isCurrent?: () => boolean;
}): Promise<ClientProgramData> {
  input = { ...input };
  if (!uuid(input.expectedUserId) || !uuid(input.clientRecordId))
    throw new ClientProgramError('invalidInput');
  const client = getSupabaseClient();
  if (!client) throw new ClientProgramError('configuration');
  let fence: Awaited<ReturnType<typeof createProgramReadFence>> | undefined;
  try {
    fence = await createProgramReadFence(
      client.auth,
      {
        userId: input.expectedUserId.toLowerCase(),
        sessionId: input.expectedSessionId,
      },
      input.isCurrent,
    );
    fence.checkCurrent();
    const token = fence.accessToken;
    const result = await client
      .rpc('get_my_client_schedule_context', {
        p_client_record_id: input.clientRecordId.toLowerCase(),
      })
      .setHeader('Authorization', `Bearer ${token}`);
    await fence.assertCurrent();
    fence.checkCurrent();
    if (result.error) throw new ClientProgramError('unavailable');
    const contextRow: unknown = result.data;
    if (
      !object(contextRow) ||
      Object.keys(contextRow).sort().join(',') !==
        'client_name,client_record_id,timezone,trainer_name,workspace_id' ||
      contextRow.client_record_id !== input.clientRecordId.toLowerCase() ||
      !uuid(contextRow.workspace_id) ||
      !text(contextRow.timezone) ||
      !text(contextRow.client_name) ||
      !text(contextRow.trainer_name)
    )
      return fail();
    try {
      new Intl.DateTimeFormat('en', { timeZone: contextRow.timezone }).format();
    } catch {
      return fail();
    }
    const context: ClientScheduleContext = {
      clientRecordId: input.clientRecordId.toLowerCase(),
      workspaceId: contextRow.workspace_id,
      timezone: contextRow.timezone,
      clientName: contextRow.client_name,
      trainerName: contextRow.trainer_name,
    };
    const response = await client
      .from('client_programs')
      .select(
        'id,workspace_id,client_record_id,name,description,revision,created_at',
      )
      .eq('workspace_id', context.workspaceId)
      .eq('client_record_id', context.clientRecordId)
      .setHeader('Authorization', `Bearer ${token}`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    await fence.assertCurrent();
    fence.checkCurrent();
    if (response.error) return fail();
    const row: unknown = response.data;
    let program: ClientPersonalProgram | null = null;
    if (row !== null) {
      if (
        !object(row) ||
        !uuid(row.id) ||
        row.workspace_id !== context.workspaceId ||
        row.client_record_id !== context.clientRecordId ||
        !text(row.name) ||
        !boundedName(row.name, 80) ||
        !boundedText(row.description, 400) ||
        !integer(row.revision, 1) ||
        !timestamp(row.created_at)
      )
        return fail();
      program = {
        id: row.id,
        name: row.name,
        description: row.description,
        revision: row.revision,
        createdAtUtc: new Date(row.created_at).toISOString(),
        exercises: [],
      };
      const ids = new Set<string>();
      const positions = new Set<number>();
      const exerciseIds = new Set<string>();
      for (let offset = 0; offset <= 50; offset += 25) {
        const lines = await client
          .from('client_program_exercises')
          .select(
            'id,workspace_id,client_program_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,note,revision',
          )
          .eq('workspace_id', context.workspaceId)
          .eq('client_program_id', program.id)
          .setHeader('Authorization', `Bearer ${token}`)
          .order('position')
          .order('id')
          .range(offset, offset + 24);
        await fence.assertCurrent();
        fence.checkCurrent();
        if (
          lines.error ||
          !Array.isArray(lines.data) ||
          lines.data.length > 25 ||
          program.exercises.length + lines.data.length > 50
        )
          return fail();
        for (const value of lines.data as unknown[]) {
          if (
            !object(value) ||
            !uuid(value.id) ||
            ids.has(value.id.toLowerCase()) ||
            !uuid(value.exercise_id) ||
            exerciseIds.has(value.exercise_id.toLowerCase()) ||
            value.workspace_id !== context.workspaceId ||
            value.client_program_id !== program.id ||
            !text(value.exercise_name_snapshot) ||
            !boundedName(value.exercise_name_snapshot, 120) ||
            (value.measure_snapshot !== 'reps' &&
              value.measure_snapshot !== 'seconds') ||
            typeof value.bodyweight_snapshot !== 'boolean' ||
            !text(value.muscle_group_snapshot) ||
            !text(value.equipment_snapshot) ||
            !Array.isArray(value.instructions_snapshot) ||
            !value.instructions_snapshot.every(text) ||
            !integer(value.position, 0, 49) ||
            positions.has(value.position) ||
            !integer(value.planned_sets, 1, 20) ||
            !units(value.planned_reps, 3) ||
            !units(value.planned_seconds, 4) ||
            (value.measure_snapshot === 'reps'
              ? value.planned_reps === null || value.planned_seconds !== null
              : value.planned_seconds === null ||
                value.planned_reps !== null) ||
            (value.planned_weight_g !== null &&
              !integer(value.planned_weight_g, 0, 1000000)) ||
            !integer(value.rest_seconds, 0, 600) ||
            !nullableText(value.note) ||
            !integer(value.revision, 1)
          )
            return fail();
          ids.add(value.id.toLowerCase());
          exerciseIds.add(value.exercise_id.toLowerCase());
          positions.add(value.position);
          program.exercises.push({
            id: value.id,
            name: value.exercise_name_snapshot,
            measure: value.measure_snapshot,
            bodyweight: value.bodyweight_snapshot,
            muscleGroup: value.muscle_group_snapshot,
            equipment: value.equipment_snapshot,
            instructions: [...value.instructions_snapshot],
            position: value.position,
            plannedSets: value.planned_sets,
            plannedReps: value.planned_reps,
            plannedSeconds: value.planned_seconds,
            plannedWeightG: value.planned_weight_g as number | null,
            restSeconds: value.rest_seconds,
            note: value.note,
            revision: value.revision,
          });
        }
        if (lines.data.length < 25) break;
      }
      program.exercises.sort(
        (a, b) => a.position - b.position || a.id.localeCompare(b.id),
      );
    }
    await fence.assertCurrent();
    fence.checkCurrent();
    return { context, program };
  } catch (error: unknown) {
    if (fence)
      await fence.assertCurrent().catch(() => {
        throw new ClientProgramError('unavailable');
      });
    try {
      fence?.checkCurrent();
    } catch {
      throw new ClientProgramError('unavailable');
    }
    if (error instanceof ClientProgramSessionError)
      throw new ClientProgramError('unavailable');
    if (error instanceof ClientProgramError) throw error;
    throw new ClientProgramError('request');
  } finally {
    fence?.dispose();
  }
}

import * as Crypto from 'expo-crypto';
import { getSupabaseClient } from '@/features/auth/client';
import type { PlanExercise, Template } from '@/domain/templates';
import type { Database, Json } from '@/lib/database.types';
import {
  toLibraryExercise,
  toWorkspaceTemplate,
  type WorkspaceExerciseRow,
  type WorkspaceLibraryExercise,
  type WorkspaceTemplateExerciseRow,
  type WorkspaceTemplateRow,
  type WorkspaceWorkoutTemplate,
} from './adapter';

export type WorkspaceExerciseInput = {
  name: string;
  muscleGroup: string;
  equipment: string;
  measure: 'reps' | 'seconds';
  bodyweight: boolean;
  aliases?: string[];
  instructions?: string[];
};

export type WorkspaceLibrary = {
  exercises: WorkspaceLibraryExercise[];
  templates: WorkspaceWorkoutTemplate[];
};

export type WorkspaceLibraryErrorCode =
  | 'configuration'
  | 'invalidInput'
  | 'duplicate'
  | 'conflict'
  | 'unavailable'
  | 'request';

export class WorkspaceLibraryError extends Error {
  constructor(readonly code: WorkspaceLibraryErrorCode) {
    super(
      code === 'configuration'
        ? 'Workspace library is unavailable'
        : code === 'invalidInput'
          ? 'Library data is invalid'
          : code === 'duplicate'
            ? 'A library item with this name already exists'
            : code === 'conflict'
              ? 'The template changed. Reload it and try again'
              : code === 'unavailable'
                ? 'The requested library item is unavailable'
                : 'Workspace library request could not be completed',
    );
    this.name = 'WorkspaceLibraryError';
  }
}

export type WorkspaceLibraryOperation<T> = { execute: () => Promise<T> };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const rpcError = (code: string | undefined) =>
  new WorkspaceLibraryError(
    code === '40001'
      ? 'conflict'
      : code === 'P0002'
        ? 'unavailable'
        : code === '23505'
          ? 'duplicate'
          : 'request',
  );

const requestError = (code: string | undefined) => rpcError(code);

const normalizeName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru').replace(/ё/g, 'е');

const canonicalInput = (
  input: WorkspaceExerciseInput,
): WorkspaceExerciseInput => ({
  name: input.name.trim().replace(/\s+/g, ' '),
  muscleGroup: input.muscleGroup.trim(),
  equipment: input.equipment.trim(),
  measure: input.measure,
  bodyweight: input.bodyweight,
  aliases: (input.aliases ?? []).map((value) => value.trim()).filter(Boolean),
  instructions: (input.instructions ?? [])
    .map((value) => value.trim())
    .filter(Boolean),
});

const exerciseMatchesInput = (
  row: WorkspaceExerciseRow,
  input: WorkspaceExerciseInput,
) =>
  row.source_key === null &&
  row.name === input.name &&
  row.muscle_group === input.muscleGroup &&
  row.equipment === input.equipment &&
  row.measure === input.measure &&
  row.bodyweight === input.bodyweight &&
  JSON.stringify(row.aliases) === JSON.stringify(input.aliases ?? []) &&
  JSON.stringify(row.instructions) === JSON.stringify(input.instructions ?? []);

const operation = <T>(run: () => Promise<T>): WorkspaceLibraryOperation<T> => {
  let result: Promise<T> | null = null;
  return {
    execute: () => {
      if (result) return result;
      result = run().catch((error: unknown) => {
        result = null;
        if (error instanceof WorkspaceLibraryError) throw error;
        throw new WorkspaceLibraryError('request');
      });
      return result;
    },
  };
};

const requireClient = () => {
  const client = getSupabaseClient();
  if (!client) throw new WorkspaceLibraryError('configuration');
  return client;
};

const validUuid = (value: string) => uuidPattern.test(value);

export async function loadWorkspaceExercises(
  workspaceId: string,
  query = '',
): Promise<WorkspaceLibraryExercise[]> {
  if (!validUuid(workspaceId)) throw new WorkspaceLibraryError('invalidInput');
  const client = requireClient();
  const pageSize = 500;
  const rows: WorkspaceExerciseRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .rpc('search_exercises', { search_query: query.trim() })
      .range(offset, offset + pageSize - 1);
    if (error) throw requestError(error.code);
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows
    .filter((exercise) => exercise.workspace_id === workspaceId)
    .map(toLibraryExercise);
}

export async function loadWorkspaceTemplates(
  workspaceId: string,
  includeArchived = false,
): Promise<WorkspaceWorkoutTemplate[]> {
  if (!validUuid(workspaceId)) throw new WorkspaceLibraryError('invalidInput');
  const client = requireClient();
  const pageSize = 500;
  const templates: WorkspaceTemplateRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let templateQuery = client
      .from('workout_templates')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name')
      .order('id')
      .range(offset, offset + pageSize - 1);
    if (!includeArchived) templateQuery = templateQuery.is('archived_at', null);
    const { data, error } = await templateQuery;
    if (error) throw requestError(error.code);
    templates.push(...data);
    if (data.length < pageSize) break;
  }
  const templateIds = templates.map((template) => template.id);
  if (templateIds.length === 0) return [];

  const lines: WorkspaceTemplateExerciseRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from('template_exercises')
      .select('*')
      .eq('workspace_id', workspaceId)
      .in('template_id', templateIds)
      .order('position')
      .order('id')
      .range(offset, offset + pageSize - 1);
    if (error) throw requestError(error.code);
    lines.push(...data);
    if (data.length < pageSize) break;
  }
  const exerciseIds = [...new Set(lines.map((line) => line.exercise_id))];
  let exercises: WorkspaceExerciseRow[] = [];
  const exercisePageSize = 200;
  for (
    let offset = 0;
    offset < exerciseIds.length;
    offset += exercisePageSize
  ) {
    const exercisePage = exerciseIds.slice(offset, offset + exercisePageSize);
    const result = await client
      .from('exercises')
      .select('*')
      .eq('workspace_id', workspaceId)
      .in('id', exercisePage);
    if (result.error) throw requestError(result.error.code);
    exercises.push(...result.data);
  }
  const byId = new Map(
    exercises.map((exercise) => [exercise.id, toLibraryExercise(exercise)]),
  );
  return templates.map((template) =>
    toWorkspaceTemplate(template, lines, byId),
  );
}

export async function loadWorkspaceLibrary(
  workspaceId: string,
  query = '',
): Promise<WorkspaceLibrary> {
  const [exercises, templates] = await Promise.all([
    loadWorkspaceExercises(workspaceId, query),
    loadWorkspaceTemplates(workspaceId),
  ]);
  return { exercises, templates };
}

export const createWorkspaceExerciseOperation = (
  workspaceId: string,
  rawInput: WorkspaceExerciseInput,
): WorkspaceLibraryOperation<{
  exercise: WorkspaceLibraryExercise;
  existing: boolean;
}> => {
  const input = canonicalInput(rawInput);
  if (
    !validUuid(workspaceId) ||
    !input.name ||
    input.name.length > 120 ||
    !input.muscleGroup ||
    !input.equipment
  )
    throw new WorkspaceLibraryError('invalidInput');
  return operation(async () => {
    const client = requireClient();
    const { data, error } = await client
      .from('exercises')
      .insert({
        workspace_id: workspaceId,
        name: input.name,
        muscle_group: input.muscleGroup,
        equipment: input.equipment,
        measure: input.measure,
        bodyweight: input.bodyweight,
        aliases: input.aliases ?? [],
        instructions: input.instructions ?? [],
      })
      .select('*')
      .single();
    if (!error) return { exercise: toLibraryExercise(data), existing: false };
    if (error.code !== '23505') throw requestError(error.code);

    const duplicate = await client
      .from('exercises')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('name_normalized', normalizeName(input.name))
      .is('archived_at', null)
      .maybeSingle();
    if (duplicate.error) throw requestError(duplicate.error.code);
    if (!duplicate.data || !exerciseMatchesInput(duplicate.data, input))
      throw new WorkspaceLibraryError('duplicate');
    return { exercise: toLibraryExercise(duplicate.data), existing: true };
  });
};

export const archiveWorkspaceExerciseOperation = (
  workspaceId: string,
  exerciseId: string,
): WorkspaceLibraryOperation<{ exerciseId: string; archivedAt: string }> => {
  if (!validUuid(workspaceId) || !validUuid(exerciseId))
    throw new WorkspaceLibraryError('invalidInput');
  const archivedAt = new Date().toISOString();
  return operation(async () => {
    const client = requireClient();
    const updated = await client
      .from('exercises')
      .update({ archived_at: archivedAt })
      .eq('workspace_id', workspaceId)
      .eq('id', exerciseId)
      .is('archived_at', null)
      .select('id,archived_at')
      .maybeSingle();
    if (updated.error) throw requestError(updated.error.code);
    if (updated.data?.archived_at)
      return {
        exerciseId: updated.data.id,
        archivedAt: updated.data.archived_at,
      };
    const existing = await client
      .from('exercises')
      .select('id,archived_at')
      .eq('workspace_id', workspaceId)
      .eq('id', exerciseId)
      .maybeSingle();
    if (existing.error) throw requestError(existing.error.code);
    if (!existing.data?.archived_at)
      throw new WorkspaceLibraryError('unavailable');
    return {
      exerciseId: existing.data.id,
      archivedAt: existing.data.archived_at,
    };
  });
};

type TemplateSaveResult = {
  id: string;
  revision: number;
  replayed: boolean;
};

const parseTemplateResult = (value: unknown): TemplateSaveResult => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !validUuid(value.id) ||
    typeof value.revision !== 'number' ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.replayed !== 'boolean'
  )
    throw new WorkspaceLibraryError('unavailable');
  return { id: value.id, revision: value.revision, replayed: value.replayed };
};

export type WorkspaceTemplateSaveInput = Omit<Template, 'exercises'> & {
  exercises: readonly (PlanExercise & {
    note?: string | null;
    plannedWeightG?: number | null;
  })[];
};

const planToJson = (template: WorkspaceTemplateSaveInput): Json[] =>
  template.exercises.map((exercise) => {
    if (!validUuid(exercise.id))
      throw new WorkspaceLibraryError('invalidInput');
    const reps = exercise.reps.trim().replace(/\s*сек\s*$/, '');
    const timed = exercise.unit === 'сек';
    return {
      exercise_id: exercise.id,
      planned_sets: exercise.sets,
      planned_reps: timed ? null : reps,
      planned_seconds: timed ? reps : null,
      planned_weight_g:
        exercise.plannedWeightG === null && exercise.target === 0
          ? null
          : Math.round(exercise.target * 1000),
      rest_seconds: exercise.rest,
      note: exercise.note ?? null,
    };
  });

export const saveWorkspaceTemplateOperation = (
  template: WorkspaceTemplateSaveInput,
  expectedRevision: number | null,
  expectedUserId: string,
  requestId = Crypto.randomUUID(),
): WorkspaceLibraryOperation<TemplateSaveResult> => {
  if (
    !validUuid(expectedUserId) ||
    !validUuid(requestId) ||
    !template.name.trim() ||
    template.name.length > 80 ||
    template.exercises.length < 1 ||
    template.exercises.length > 50 ||
    (template.id && !validUuid(template.id)) ||
    (expectedRevision !== null && expectedRevision < 1)
  )
    throw new WorkspaceLibraryError('invalidInput');
  const templateId =
    template.id && expectedRevision !== null ? template.id : null;
  const name = template.name;
  const description = template.description;
  const exercises = planToJson(template);
  const args = {
    p_template_id: templateId,
    p_expected_revision: expectedRevision,
    p_name: name,
    p_description: description,
    p_exercises: exercises,
    p_request_id: requestId,
  } as unknown as Database['public']['Functions']['save_workout_template']['Args'];
  return operation(async () => {
    const client = requireClient();
    const session = await client.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (
      session.error ||
      session.data.session?.user.id !== expectedUserId ||
      !accessToken
    )
      throw new WorkspaceLibraryError('unavailable');
    const { data, error } = await client
      .rpc('save_workout_template', args)
      .setHeader('Authorization', `Bearer ${accessToken}`);
    if (error) throw requestError(error.code);
    return parseTemplateResult(data);
  });
};

export const archiveWorkspaceTemplateOperation = (
  templateId: string,
  expectedRevision: number,
): WorkspaceLibraryOperation<TemplateSaveResult> => {
  if (
    !validUuid(templateId) ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1
  )
    throw new WorkspaceLibraryError('invalidInput');
  const requestId = Crypto.randomUUID();
  return operation(async () => {
    const client = requireClient();
    const { data, error } = await client.rpc('archive_workout_template', {
      p_template_id: templateId,
      p_expected_revision: expectedRevision,
      p_request_id: requestId,
    });
    if (error) throw requestError(error.code);
    return parseTemplateResult(data);
  });
};

export const workspaceTemplateExpectedRevision = (
  template: WorkspaceWorkoutTemplate | null,
) => (template ? template.revision : null);

export type WorkspaceTemplateLine = WorkspaceTemplateExerciseRow;
export type WorkspaceTemplateRecord = WorkspaceTemplateRow;

import {
  templateMutation,
  type TemplateMutationScope,
} from './template-mutation';
import * as Crypto from 'expo-crypto';
import {
  createWorkspaceLibraryReadFence,
  WorkspaceLibrarySessionError,
} from './read-session';
import {
  isWorkspaceExerciseRead,
  isWorkspaceTemplateRead,
  isWorkspaceTemplateLineRead,
  isWorkspaceLibraryOwner,
} from './read-validation';
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
  | 'request'
  | 'readLimit';

export class WorkspaceLibraryError extends Error {
  constructor(readonly code: WorkspaceLibraryErrorCode) {
    super(
      code === 'readLimit'
        ? 'Library data exceeds the bounded read limit'
        : code === 'configuration'
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

export type WorkspaceLibraryOperation<T> = {
  execute: () => Promise<T>;
  dispose?: () => void;
};

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

export type WorkspaceLibraryReadScope = {
  userId: string;
  workspaceId: string;
  sessionId?: string;
  isCurrent?: () => boolean;
};

export const MAX_WORKSPACE_LIBRARY_READ_PAGES = 20;
const readPageSize = 500;
const readBatchSize = 200;
type ReadClient = ReturnType<typeof requireClient>;
type ReadFence = Awaited<ReturnType<typeof createWorkspaceLibraryReadFence>>;
const rejectRead = (): never => {
  throw new WorkspaceLibraryError('request');
};
const authorizeRead = <T extends { setHeader(name: string, value: string): T }>(
  query: T,
  fence: ReadFence,
): T => query.setHeader('Authorization', `Bearer ${fence.accessToken}`);
const readPages = async <T extends { id: string }>(
  query: (
    start: number,
    end: number,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
  validate: (value: unknown) => value is T,
  fence: ReadFence,
): Promise<T[]> => {
  const rows: T[] = [];
  const ids = new Set<string>();
  for (let page = 0; page < MAX_WORKSPACE_LIBRARY_READ_PAGES; page += 1) {
    await fence.assertCurrent();
    const result = await query(
      page * readPageSize,
      (page + 1) * readPageSize - 1,
    );
    await fence.assertCurrent();
    if (
      result.error ||
      !Array.isArray(result.data) ||
      result.data.length > readPageSize
    )
      rejectRead();
    const values: unknown[] = result.data as unknown[];
    for (const value of values) {
      if (!validate(value)) return rejectRead();
      if (ids.has(value.id)) return rejectRead();
      ids.add(value.id);
      rows.push(value);
    }
    if (values.length < readPageSize) return rows;
  }
  throw new WorkspaceLibraryError('readLimit');
};
const readExercises = async (
  client: ReadClient,
  fence: ReadFence,
  workspaceId: string,
  query: string,
) => {
  const rows = await readPages(
    (start, end) =>
      authorizeRead(
        client
          .rpc('search_exercises', { search_query: query.trim() })
          .eq('workspace_id', workspaceId)
          .order('name_normalized')
          .order('id')
          .range(start, end),
        fence,
      ),
    (value): value is WorkspaceExerciseRow =>
      isWorkspaceExerciseRead(value, workspaceId) && value.archived_at === null,
    fence,
  );
  return rows.map(toLibraryExercise);
};
const readTemplates = async (
  client: ReadClient,
  fence: ReadFence,
  workspaceId: string,
  includeArchived: boolean,
) => {
  const templates = await readPages(
    (start, end) => {
      let query = client
        .from('workout_templates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name')
        .order('id')
        .range(start, end);
      if (!includeArchived) query = query.is('archived_at', null);
      return authorizeRead(query, fence);
    },
    (value): value is WorkspaceTemplateRow =>
      isWorkspaceTemplateRead(value, workspaceId) &&
      (includeArchived || value.archived_at === null),
    fence,
  );
  const lines: WorkspaceTemplateExerciseRow[] = [];
  const lineIds = new Set<string>();
  for (let offset = 0; offset < templates.length; offset += readBatchSize) {
    const ids = templates
      .slice(offset, offset + readBatchSize)
      .map((row) => row.id);
    const requested = new Set(ids);
    const batch = await readPages(
      (start, end) =>
        authorizeRead(
          client
            .from('template_exercises')
            .select('*')
            .eq('workspace_id', workspaceId)
            .in('template_id', ids)
            .order('template_id')
            .order('position')
            .order('id')
            .range(start, end),
          fence,
        ),
      (value): value is WorkspaceTemplateExerciseRow =>
        isWorkspaceTemplateLineRead(value, workspaceId) &&
        requested.has(value.template_id),
      fence,
    );
    for (const line of batch) {
      if (lineIds.has(line.id)) rejectRead();
      lineIds.add(line.id);
      lines.push(line);
    }
  }
  const exerciseIds = [
    ...new Set(lines.map((line) => line.exercise_id)),
  ].sort();
  const exercises: WorkspaceExerciseRow[] = [];
  const foundIds = new Set<string>();
  for (let offset = 0; offset < exerciseIds.length; offset += readBatchSize) {
    const ids = exerciseIds.slice(offset, offset + readBatchSize);
    const requested = new Set(ids);
    const batch = await readPages(
      (start, end) =>
        authorizeRead(
          client
            .from('exercises')
            .select('*')
            .eq('workspace_id', workspaceId)
            .in('id', ids)
            .order('id')
            .range(start, end),
          fence,
        ),
      (value): value is WorkspaceExerciseRow =>
        isWorkspaceExerciseRead(value, workspaceId) && requested.has(value.id),
      fence,
    );
    for (const row of batch) {
      if (foundIds.has(row.id)) rejectRead();
      foundIds.add(row.id);
      exercises.push(row);
    }
    if (batch.length !== ids.length) rejectRead();
  }
  const byId = new Map(
    exercises.map((row) => [row.id, toLibraryExercise(row)]),
  );
  const linesByTemplate = new Map<string, WorkspaceTemplateExerciseRow[]>();
  for (const line of lines) {
    const group = linesByTemplate.get(line.template_id) ?? [];
    group.push(line);
    linesByTemplate.set(line.template_id, group);
  }
  for (const template of templates) {
    const templateLines = (linesByTemplate.get(template.id) ?? []).sort(
      (a, b) => a.position - b.position,
    );
    if (templateLines.length < 1 || templateLines.length > 50) rejectRead();
    const relationIds = new Set<string>();
    for (const [position, line] of templateLines.entries()) {
      const exercise = byId.get(line.exercise_id);
      if (
        line.position !== position ||
        relationIds.has(line.exercise_id) ||
        !exercise ||
        (exercise.measure === 'seconds') !== (line.planned_seconds !== null)
      )
        rejectRead();
      relationIds.add(line.exercise_id);
    }
  }
  return templates.map((row) =>
    toWorkspaceTemplate(row, linesByTemplate.get(row.id) ?? [], byId),
  );
};
const withLibraryRead = async <T>(
  workspaceId: string,
  scope: WorkspaceLibraryReadScope | undefined,
  read: (client: ReadClient, fence: ReadFence) => Promise<T>,
): Promise<T> => {
  if (
    !validUuid(workspaceId) ||
    (scope &&
      (!validUuid(scope.userId) ||
        scope.workspaceId !== workspaceId ||
        (scope.sessionId !== undefined && !validUuid(scope.sessionId))))
  )
    throw new WorkspaceLibraryError('invalidInput');
  const client = requireClient();
  const fence = await createWorkspaceLibraryReadFence(
    client.auth,
    scope,
    scope?.isCurrent,
  );
  try {
    await fence.assertCurrent();
    const owner = await authorizeRead(
      client
        .from('trainer_workspaces')
        .select('id,owner_user_id')
        .eq('id', workspaceId)
        .maybeSingle(),
      fence,
    );
    await fence.assertCurrent();
    if (
      owner.error ||
      !isWorkspaceLibraryOwner(owner.data, workspaceId, fence.userId)
    )
      throw new WorkspaceLibraryError('unavailable');
    const result = await read(client, fence);
    await fence.assertCurrent();
    return result;
  } catch (error: unknown) {
    if (
      error instanceof WorkspaceLibraryError ||
      error instanceof WorkspaceLibrarySessionError
    )
      throw error;
    throw new WorkspaceLibraryError('request');
  } finally {
    fence.dispose();
  }
};
export async function loadWorkspaceExercises(
  workspaceId: string,
  query = '',
  scope?: WorkspaceLibraryReadScope,
): Promise<WorkspaceLibraryExercise[]> {
  if (typeof query !== 'string')
    throw new WorkspaceLibraryError('invalidInput');
  return withLibraryRead(workspaceId, scope, (client, fence) =>
    readExercises(client, fence, workspaceId, query),
  );
}
export async function loadWorkspaceTemplates(
  workspaceId: string,
  includeArchived = false,
  scope?: WorkspaceLibraryReadScope,
): Promise<WorkspaceWorkoutTemplate[]> {
  if (typeof includeArchived !== 'boolean')
    throw new WorkspaceLibraryError('invalidInput');
  return withLibraryRead(workspaceId, scope, (client, fence) =>
    readTemplates(client, fence, workspaceId, includeArchived),
  );
}
export async function loadWorkspaceLibrary(
  workspaceId: string,
  query = '',
  scope?: WorkspaceLibraryReadScope,
): Promise<WorkspaceLibrary> {
  if (typeof query !== 'string')
    throw new WorkspaceLibraryError('invalidInput');
  return withLibraryRead(workspaceId, scope, async (client, fence) => {
    const exercises = await readExercises(client, fence, workspaceId, query);
    const templates = await readTemplates(client, fence, workspaceId, false);
    return { exercises, templates };
  });
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
  scope?: TemplateMutationScope,
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
  const client = requireClient();
  return templateMutation(
    client.auth,
    { ...scope, userId: expectedUserId },
    () => new WorkspaceLibraryError('unavailable'),
    async (accessToken) => {
      const { data, error } = await client
        .rpc('save_workout_template', args)
        .setHeader('Authorization', `Bearer ${accessToken}`);
      if (error) throw requestError(error.code);
      return parseTemplateResult(data);
    },
    (error) =>
      error instanceof WorkspaceLibraryError
        ? error
        : new WorkspaceLibraryError('request'),
  );
};

export const archiveWorkspaceTemplateOperation = (
  templateId: string,
  expectedRevision: number,
  scope?: TemplateMutationScope,
): WorkspaceLibraryOperation<TemplateSaveResult> => {
  if (
    !validUuid(templateId) ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1
  )
    throw new WorkspaceLibraryError('invalidInput');
  const requestId = Crypto.randomUUID();
  const client = requireClient();
  return templateMutation(
    client.auth,
    scope,
    () => new WorkspaceLibraryError('unavailable'),
    async (accessToken) => {
      const { data, error } = await client
        .rpc('archive_workout_template', {
          p_template_id: templateId,
          p_expected_revision: expectedRevision,
          p_request_id: requestId,
        })
        .setHeader('Authorization', `Bearer ${accessToken}`);
      if (error) throw requestError(error.code);
      return parseTemplateResult(data);
    },
    (error) =>
      error instanceof WorkspaceLibraryError
        ? error
        : new WorkspaceLibraryError('request'),
  );
};

export const workspaceTemplateExpectedRevision = (
  template: WorkspaceWorkoutTemplate | null,
) => (template ? template.revision : null);

export type WorkspaceTemplateLine = WorkspaceTemplateExerciseRow;
export type WorkspaceTemplateRecord = WorkspaceTemplateRow;

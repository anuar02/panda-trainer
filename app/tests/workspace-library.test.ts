import * as Crypto from 'expo-crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  archiveWorkspaceTemplateOperation,
  createWorkspaceExerciseOperation,
  saveWorkspaceTemplateOperation,
  WorkspaceLibraryError,
  type WorkspaceTemplateSaveInput,
} from '../src/features/workspace-library/service';
import {
  toLibraryExercise,
  toWorkspaceTemplate,
  type WorkspaceExerciseRow,
  type WorkspaceTemplateExerciseRow,
  type WorkspaceTemplateRow,
} from '../src/features/workspace-library/adapter';
import type { Database } from '../src/lib/database.types';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const getClient = jest.mocked(getSupabaseClient);
const randomUUID = jest.mocked(Crypto.randomUUID);
const workspaceId = '61000000-0000-4000-8000-000000000001';
const exerciseId = '81000000-0000-4000-8000-000000000001';
const templateId = '91000000-0000-4000-8000-000000000001';
const requestId = 'a1000000-0000-4000-8000-000000000001';
const userId = '51000000-0000-4000-8000-000000000001';
const otherUserId = '51000000-0000-4000-8000-000000000002';
const accessToken = `header.${btoa(JSON.stringify({ sub: userId, session_id: requestId })).replace(/=/g, '')}.signature`;

const row: WorkspaceExerciseRow = {
  id: exerciseId,
  workspace_id: workspaceId,
  source_key: 'e0',
  name: 'Приседания со штангой',
  name_normalized: 'приседания со штангой',
  muscle_group: 'Ноги',
  equipment: 'штанга',
  measure: 'reps',
  bodyweight: false,
  aliases: ['присед'],
  instructions: ['Держите спину прямо.'],
  archived_at: '2026-10-01T12:00:00.000Z',
  revision: 2,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
  created_by: null,
};

const templateRow: WorkspaceTemplateRow = {
  id: templateId,
  workspace_id: workspaceId,
  name: 'Низ А',
  name_normalized: 'низ а',
  description: 'Силовой план',
  archived_at: null,
  revision: 3,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
  created_by: null,
};

const line: WorkspaceTemplateExerciseRow = {
  id: 'b1000000-0000-4000-8000-000000000001',
  workspace_id: workspaceId,
  template_id: templateId,
  exercise_id: exerciseId,
  position: 0,
  planned_sets: 4,
  planned_reps: '8–12',
  planned_seconds: null,
  planned_weight_g: 42500,
  rest_seconds: 120,
  note: 'Контроль темпа',
  revision: 2,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
  created_by: null,
};

const client = (parts: object, sessionUserId = userId) =>
  ({
    ...parts,
    auth: {
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: sessionUserId },
            access_token: accessToken,
          },
        },
        error: null,
      }),
    },
  }) as unknown as SupabaseClient<Database>;

const postgrestResponse = (response: {
  data: unknown;
  error: { code: string } | null;
}) => {
  let builder: Promise<typeof response> & { setHeader: jest.Mock };
  const promise = Promise.resolve(response);
  builder = Object.assign(promise, {
    setHeader: jest.fn().mockImplementation(() => builder),
  });
  return builder;
};

describe('workspace library adapter', () => {
  it('keeps database UUIDs and canonical media source keys separate', () => {
    const exercise = toLibraryExercise(row);

    expect(exercise.id).toBe(exerciseId);
    expect(exercise.sourceKey).toBe('e0');
    expect(exercise.group).toBe('Ноги');
    expect(exercise.archivedAt).toBe(row.archived_at);
  });

  it('resolves archived exercise references in templates and maps stored units', () => {
    const exercise = toLibraryExercise(row);
    const template = toWorkspaceTemplate(
      templateRow,
      [line],
      new Map([[exercise.id, exercise]]),
    );

    expect(template).toMatchObject({
      id: templateId,
      revision: 3,
      name: 'Низ А',
      exercises: [
        {
          id: exerciseId,
          name: row.name,
          sets: 4,
          reps: '8–12',
          target: 42.5,
          rest: 120,
          unit: 'повт',
          note: 'Контроль темпа',
          plannedWeightG: 42500,
          exercise: { archivedAt: row.archived_at },
        },
      ],
    });
  });

  it('maps timed template rows to seconds without changing their UUID', () => {
    const timedExercise = toLibraryExercise({ ...row, measure: 'seconds' });
    const timedLine = {
      ...line,
      planned_reps: null,
      planned_seconds: '45–60',
      planned_weight_g: null,
    };
    const template = toWorkspaceTemplate(
      templateRow,
      [timedLine],
      new Map([[timedExercise.id, timedExercise]]),
    );

    expect(template.exercises[0]).toMatchObject({
      id: exerciseId,
      reps: '45–60 сек',
      target: 0,
      unit: 'сек',
    });
  });
});

describe('workspace library adapter read validation', () => {
  it('rejects unknown measures instead of silently defaulting to repetitions', () => {
    expect(() => toLibraryExercise({ ...row, measure: 'meters' })).toThrow();
  });

  it('rejects plan units that disagree with the exercise measure', () => {
    expect(() =>
      toWorkspaceTemplate(
        templateRow,
        [line],
        new Map([
          [exerciseId, toLibraryExercise({ ...row, measure: 'seconds' })],
        ]),
      ),
    ).toThrow();
  });

  it.each([null, 0, 1])(
    'preserves exact grams %s and null separately from zero',
    (grams) => {
      const loaded = toWorkspaceTemplate(
        templateRow,
        [{ ...line, planned_weight_g: grams }],
        new Map([[exerciseId, toLibraryExercise(row)]]),
      );
      expect(loaded.exercises[0]?.plannedWeightG).toBe(grams);
      expect(loaded.exercises[0]?.target).toBe((grams ?? 0) / 1000);
    },
  );
});

describe('workspace library service operations', () => {
  beforeEach(() => {
    getClient.mockReset();
    randomUUID.mockReset().mockReturnValue(requestId);
  });

  it('returns the exact existing custom exercise after an ambiguous duplicate insert', async () => {
    const exerciseBuilder = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnValue(
        postgrestResponse({
          data: null,
          error: { code: '23505' },
        }),
      ),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      maybeSingle: jest
        .fn()
        .mockReturnValueOnce(postgrestResponse({ data: null, error: null }))
        .mockReturnValue(
          postgrestResponse({
            data: {
              ...row,
              name: 'Жим ЛЁЖА',
              name_normalized: 'жим лежа',
              archived_at: null,
              source_key: null,
            },
            error: null,
          }),
        ),
    };
    const supabase = client({
      from: jest.fn((table) =>
        table === 'exercises'
          ? exerciseBuilder
          : {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: () =>
                postgrestResponse({
                  data: { id: workspaceId, owner_user_id: userId },
                  error: null,
                }),
            },
      ),
    });
    getClient.mockReturnValue(supabase);
    const operation = createWorkspaceExerciseOperation(workspaceId, {
      name: 'Жим ЛЁЖА',
      muscleGroup: 'Ноги',
      equipment: 'штанга',
      measure: 'reps',
      bodyweight: false,
      aliases: ['присед'],
      instructions: ['Держите спину прямо.'],
    });

    await expect(operation.execute()).resolves.toMatchObject({
      exercise: { id: exerciseId, sourceKey: null },
      existing: true,
    });
    expect(exerciseBuilder.insert).toHaveBeenCalledWith({
      id: requestId,
      workspace_id: workspaceId,
      name: 'Жим ЛЁЖА',
      muscle_group: 'Ноги',
      equipment: 'штанга',
      measure: 'reps',
      bodyweight: false,
      aliases: ['присед'],
      instructions: ['Держите спину прямо.'],
    });
    expect(exerciseBuilder.eq).toHaveBeenCalledWith(
      'name_normalized',
      'жим лежа',
    );
  });

  it('keeps an operation retry on one request UUID and sends UUID exercise ids', async () => {
    const rpc = jest
      .fn()
      .mockReturnValueOnce(
        postgrestResponse({ data: null, error: { code: '08006' } }),
      )
      .mockReturnValueOnce(
        postgrestResponse({
          data: { id: templateId, revision: 2, replayed: true },
          error: null,
        }),
      );
    getClient.mockReturnValue(client({ rpc }));
    const template: WorkspaceTemplateSaveInput = {
      id: templateId,
      name: 'Низ А',
      description: '',
      exercises: [
        {
          id: exerciseId,
          name: row.name,
          sets: 3,
          reps: '8–12',
          target: 7.5,
          rest: 90,
          unit: 'повт',
          plannedWeightG: 5000,
          note: 'Keep this cue',
        },
        {
          id: '81000000-0000-4000-8000-000000000003',
          name: 'Жим ногами',
          sets: 3,
          reps: '10',
          target: 3,
          rest: 90,
          unit: 'повт',
          plannedWeightG: null,
        },
        {
          id: '81000000-0000-4000-8000-000000000004',
          name: 'Разминка',
          sets: 1,
          reps: '8',
          target: 0,
          rest: 0,
          unit: 'повт',
          plannedWeightG: null,
        },
        {
          id: '81000000-0000-4000-8000-000000000002',
          name: 'Планка',
          sets: 2,
          reps: '45–60 сек',
          target: 0,
          rest: 30,
          unit: 'сек',
        },
      ],
    };
    const save = saveWorkspaceTemplateOperation(template, 1, userId);

    await expect(save.execute()).rejects.toMatchObject({ code: 'request' });
    await expect(save.execute()).resolves.toEqual({
      id: templateId,
      revision: 2,
      replayed: true,
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc.mock.calls[0]).toEqual([
      'save_workout_template',
      {
        p_template_id: templateId,
        p_expected_revision: 1,
        p_name: 'Низ А',
        p_description: '',
        p_exercises: [
          {
            exercise_id: exerciseId,
            planned_sets: 3,
            planned_reps: '8–12',
            planned_seconds: null,
            planned_weight_g: 7500,
            rest_seconds: 90,
            note: 'Keep this cue',
          },
          {
            exercise_id: '81000000-0000-4000-8000-000000000003',
            planned_sets: 3,
            planned_reps: '10',
            planned_seconds: null,
            planned_weight_g: 3000,
            rest_seconds: 90,
            note: null,
          },
          {
            exercise_id: '81000000-0000-4000-8000-000000000004',
            planned_sets: 1,
            planned_reps: '8',
            planned_seconds: null,
            planned_weight_g: null,
            rest_seconds: 0,
            note: null,
          },
          {
            exercise_id: '81000000-0000-4000-8000-000000000002',
            planned_sets: 2,
            planned_reps: null,
            planned_seconds: '45–60',
            planned_weight_g: 0,
            rest_seconds: 30,
            note: null,
          },
        ],
        p_request_id: requestId,
      },
    ]);
    expect(rpc.mock.results[0]?.value.setHeader).toHaveBeenCalledWith(
      'Authorization',
      `Bearer ${accessToken}`,
    );
  });

  it('restores a save operation with its request UUID and immutable payload', async () => {
    const rpc = jest
      .fn()
      .mockReturnValueOnce(
        postgrestResponse({ data: null, error: { code: '08006' } }),
      )
      .mockReturnValueOnce(
        postgrestResponse({
          data: { id: templateId, revision: 2, replayed: true },
          error: null,
        }),
      );
    getClient.mockReturnValue(client({ rpc }));
    const template: WorkspaceTemplateSaveInput = {
      id: templateId,
      name: 'Низ А',
      description: 'Силовой план',
      exercises: [
        {
          id: exerciseId,
          name: row.name,
          sets: 3,
          reps: '8–12',
          target: 7.5,
          rest: 90,
          unit: 'повт',
          plannedWeightG: 5000,
        },
      ],
    };
    const savedSnapshot: WorkspaceTemplateSaveInput = {
      ...template,
      exercises: template.exercises.map((exercise) => ({ ...exercise })),
    };
    const firstAttempt = saveWorkspaceTemplateOperation(
      template,
      1,
      userId,
      requestId,
    );

    template.name = 'Mutated after operation creation';
    template.description = 'Changed';
    const changedExercise = template.exercises[0];
    if (changedExercise) changedExercise.target = 99;
    await expect(firstAttempt.execute()).rejects.toMatchObject({
      code: 'request',
    });

    const restoredAttempt = saveWorkspaceTemplateOperation(
      savedSnapshot,
      1,
      userId,
      requestId,
    );
    await expect(restoredAttempt.execute()).resolves.toMatchObject({
      id: templateId,
      revision: 2,
      replayed: true,
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_request_id: requestId,
      p_name: 'Низ А',
      p_description: 'Силовой план',
      p_exercises: [{ exercise_id: exerciseId, planned_weight_g: 7500 }],
    });
  });

  it('rejects malformed persisted save request UUIDs', () => {
    expect(() =>
      saveWorkspaceTemplateOperation(
        {
          id: templateId,
          name: 'Низ А',
          description: '',
          exercises: [
            {
              id: exerciseId,
              name: row.name,
              sets: 3,
              reps: '8',
              target: 0,
              rest: 90,
              unit: 'повт',
            },
          ],
        },
        1,
        userId,
        'not-a-uuid',
      ),
    ).toThrow(expect.objectContaining({ code: 'invalidInput' }));
  });

  it('uses one request UUID for retrying an archive RPC', async () => {
    const response = {
      data: { id: templateId, revision: 4, replayed: false },
      error: null,
    };
    const rpc = jest.fn(() => ({
      setHeader: jest.fn().mockResolvedValue(response),
    }));
    getClient.mockReturnValue(client({ rpc }));
    const archive = archiveWorkspaceTemplateOperation(templateId, 3);

    await archive.execute();
    await archive.execute();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('archive_workout_template', {
      p_template_id: templateId,
      p_expected_revision: 3,
      p_request_id: requestId,
    });
  });

  it('does not expose database error details to callers', async () => {
    const response = {
      data: null,
      error: { code: '40001', message: 'internal row state' },
    };
    const rpc = jest.fn(() => ({
      setHeader: jest.fn().mockResolvedValue(response),
    }));
    getClient.mockReturnValue(client({ rpc }));
    const archive = archiveWorkspaceTemplateOperation(templateId, 3);

    await expect(archive.execute()).rejects.toBeInstanceOf(
      WorkspaceLibraryError,
    );
    await expect(archive.execute()).rejects.toMatchObject({
      code: 'conflict',
      message: 'The template changed. Reload it and try again',
    });
  });

  it('rejects a save if the active session belongs to another account', async () => {
    const rpc = jest.fn();
    getClient.mockReturnValue(client({ rpc }, otherUserId));
    const save = saveWorkspaceTemplateOperation(
      {
        id: templateId,
        name: 'Низ А',
        description: '',
        exercises: [
          {
            id: exerciseId,
            name: row.name,
            sets: 3,
            reps: '8',
            target: 0,
            rest: 90,
            unit: 'повт',
          },
        ],
      },
      1,
      userId,
    );

    await expect(save.execute()).rejects.toMatchObject({ code: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

import type { PlanExercise, Template } from '@/domain/templates';
import type { Database } from '@/lib/database.types';
import type { LibraryExercise } from '@/features/trainer-library/fixtures';

export type WorkspaceExerciseRow =
  Database['public']['Tables']['exercises']['Row'];
export type WorkspaceTemplateRow =
  Database['public']['Tables']['workout_templates']['Row'];
export type WorkspaceTemplateExerciseRow =
  Database['public']['Tables']['template_exercises']['Row'];

export type WorkspaceLibraryExercise = LibraryExercise & {
  sourceKey: string | null;
  archivedAt: string | null;
  revision: number;
  measure: 'reps' | 'seconds';
  bodyweight: boolean;
};

export type WorkspacePlanExercise = PlanExercise & {
  lineId: string;
  lineRevision: number;
  position: number;
  note: string | null;
  plannedWeightG: number | null;
  exercise: WorkspaceLibraryExercise;
};

export type WorkspaceWorkoutTemplate = Omit<Template, 'exercises'> & {
  revision: number;
  archivedAt: string | null;
  exercises: WorkspacePlanExercise[];
};

export const toLibraryExercise = (
  row: WorkspaceExerciseRow,
): WorkspaceLibraryExercise => {
  if (row.measure !== 'reps' && row.measure !== 'seconds')
    throw new Error('Library data is invalid');
  return {
    id: row.id,
    name: row.name,
    group: row.muscle_group,
    equipment: row.equipment,
    aliases: row.aliases,
    instructions: row.instructions,
    sourceKey: row.source_key,
    archivedAt: row.archived_at,
    revision: row.revision,
    measure: row.measure,
    bodyweight: row.bodyweight,
  };
};

export const toWorkspaceTemplate = (
  row: WorkspaceTemplateRow,
  lines: readonly WorkspaceTemplateExerciseRow[],
  exercises: ReadonlyMap<string, WorkspaceLibraryExercise>,
): WorkspaceWorkoutTemplate => {
  const plan = lines
    .filter((line) => line.template_id === row.id)
    .sort((first, second) => first.position - second.position)
    .map((line): WorkspacePlanExercise => {
      const exercise = exercises.get(line.exercise_id);
      if (!exercise) throw new Error('Template exercise unavailable');
      const timed = line.planned_seconds !== null;
      if (
        timed !== (exercise.measure === 'seconds') ||
        (line.planned_reps !== null && line.planned_seconds !== null)
      )
        throw new Error('Library data is invalid');
      const reps = timed ? line.planned_seconds : line.planned_reps;
      if (reps === null) throw new Error('Template exercise unavailable');
      return {
        id: exercise.id,
        name: exercise.name,
        sets: line.planned_sets,
        reps: timed ? `${reps} сек` : reps,
        target: (line.planned_weight_g ?? 0) / 1000,
        rest: line.rest_seconds,
        unit: timed ? 'сек' : 'повт',
        lineId: line.id,
        lineRevision: line.revision,
        position: line.position,
        note: line.note,
        plannedWeightG: line.planned_weight_g,
        exercise,
      };
    });
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    custom: true,
    revision: row.revision,
    archivedAt: row.archived_at,
    exercises: plan,
  };
};

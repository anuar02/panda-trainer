import type { PreloadExercise } from '@/domain/workout-preload/types';
import type { JsonValue, SyncSession } from '@/domain/workout-sync/types';

export type EntryConflict = {
  id: string;
  entityId: string;
  revision: number;
  current: JsonValue;
  incoming: JsonValue;
};
export async function loadEntryResources(
  session: SyncSession,
  workoutId: string,
  signal: AbortSignal,
): Promise<{ catalog: PreloadExercise[]; conflicts: EntryConflict[] }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('configuration');
  async function rows(table: string, filters: Record<string, string>) {
    const result: Record<string, unknown>[] = [];
    for (let offset = 0; offset < 10000; offset += 500) {
      const params = new URLSearchParams({
        workspace_id: `eq.${session.workspaceId}`,
        ...filters,
        limit: '500',
        offset: String(offset),
        order: 'id.asc',
      });
      const response = await fetch(`${url}/rest/v1/${table}?${params}`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${session.accessToken}`,
        },
        signal,
      });
      if (!response.ok || signal.aborted) throw new Error('request');
      const page: unknown = await response.json();
      if (
        !Array.isArray(page) ||
        page.some((row) => !row || typeof row !== 'object')
      )
        throw new Error('response');
      result.push(...(page as Record<string, unknown>[]));
      if (page.length < 500) return result;
    }
    throw new Error('response');
  }
  const [catalog, conflicts] = await Promise.all([
    rows('exercises', {
      archived_at: 'is.null',
      select:
        'id,name,measure,bodyweight,muscle_group,equipment,instructions,source_key',
    }),
    rows('workout_sync_conflicts', {
      workout_instance_id: `eq.${workoutId}`,
      resolved_at: 'is.null',
      select:
        'id,entity_id,expected_revision,current_version,incoming_operation',
    }),
  ]);
  return {
    catalog: catalog.map((row) => {
      if (
        typeof row.id !== 'string' ||
        typeof row.name !== 'string' ||
        !['reps', 'seconds'].includes(String(row.measure)) ||
        typeof row.bodyweight !== 'boolean' ||
        !Array.isArray(row.instructions) ||
        !row.instructions.every((value) => typeof value === 'string')
      )
        throw new Error('response');
      return {
        id: row.id,
        exerciseId: row.id,
        name: row.name,
        measure: row.measure as 'reps' | 'seconds',
        bodyweight: row.bodyweight,
        muscleGroup: String(row.muscle_group),
        equipment: String(row.equipment),
        instructions: row.instructions as string[],
        sourceKey: typeof row.source_key === 'string' ? row.source_key : null,
        position: 0,
        plannedSets: 0,
        plannedReps: null,
        plannedSeconds: null,
        plannedWeightGrams: null,
        restSeconds: null,
        revision: 0,
        skipped: false,
        replacedFromId: null,
        sets: [],
        previousSets: [],
      };
    }),
    conflicts: conflicts.map((row) => {
      if (
        typeof row.id !== 'string' ||
        typeof row.entity_id !== 'string' ||
        !Number.isSafeInteger(row.expected_revision)
      )
        throw new Error('response');
      return {
        id: row.id,
        entityId: row.entity_id,
        revision: row.expected_revision as number,
        current: row.current_version as JsonValue,
        incoming: row.incoming_operation as JsonValue,
      };
    }),
  };
}

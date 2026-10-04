import { boundedExportStep } from './service';
import { exportRowSchemas, isExportUuid } from '@/domain/account-export';
import type { ServerContextReader, CollectedSource } from './collector-types';
import {
  assertSafeExportData,
  validateJournalPart,
  validateJournalConflict,
} from './local-adapter';
type Response = { data: unknown; error: unknown };
type Query = PromiseLike<Response> & {
  eq(key: string, value: string): Query;
  order(key: string): Query;
  range(from: number, to: number): Query;
  setHeader(key: string, value: string): Query;
  abortSignal?(signal: AbortSignal): Query;
};
export type ServerContextTransport = {
  from(table: 'workout_sync_conflicts' | 'workout_correction_drafts'): {
    select(columns: string): Query;
  };
};
const columns = {
  workout_sync_conflicts:
    'id,workspace_id,workout_instance_id,entity_id,kind,current_version,incoming_operation,expected_revision,resolved_at,selected_version',
  workout_correction_drafts:
    'id,workspace_id,workout_instance_id,operation,created_at,applied_at,applied_request_id',
};
export function createServerContextReader(
  transport: ServerContextTransport,
  options: { token: string; guard(): Promise<void> },
): ServerContextReader {
  return async (scope, signal) => {
    const sources: CollectedSource[] = [];
    for (const table of [
      'workout_sync_conflicts',
      'workout_correction_drafts',
    ] as const) {
      const records: unknown[] = [];
      const ids = new Set<string>();
      try {
        for (let offset = 0; ;) {
          await boundedExportStep(options.guard(), signal, 5000);
          if (signal?.aborted) throw new Error('cancelled');
          let query = transport
            .from(table)
            .select(columns[table])
            .eq('workspace_id', scope.workspaceId)
            .order('id')
            .range(offset, offset + 99)
            .setHeader('Authorization', `Bearer ${options.token}`);
          if (signal && query.abortSignal) query = query.abortSignal(signal);
          const response = await boundedExportStep(query, signal, 15000);
          await boundedExportStep(options.guard(), signal, 5000);
          if (signal?.aborted) throw new Error('cancelled');
          if (
            response.error ||
            !Array.isArray(response.data) ||
            response.data.length > 100
          )
            throw new Error('request');
          for (const value of response.data) {
            if (!value || typeof value !== 'object' || Array.isArray(value))
              throw new Error('malformed');
            const row = value as Record<string, unknown>;
            const expected = columns[table].split(',');
            if (
              Object.keys(row).sort().join(',') !==
                [...expected].sort().join(',') ||
              row.workspace_id !== scope.workspaceId ||
              !isExportUuid(row.id) ||
              !isExportUuid(row.workout_instance_id) ||
              ids.has(String(row.id))
            )
              throw new Error('scope-or-shape');
            const incoming =
              row[
                table === 'workout_sync_conflicts'
                  ? 'incoming_operation'
                  : 'operation'
              ];
            validateJournalPart(scope, [
              { operation: incoming, sequence: 1, result: null },
            ]);
            if (
              !incoming ||
              typeof incoming !== 'object' ||
              Array.isArray(incoming)
            )
              throw new Error('malformed');
            const operation = incoming as Record<string, unknown>;
            const payload = operation.payload as Record<string, unknown>;
            if (
              operation.kind !== 'resolve_conflict' &&
              (payload.workout_instance_id ?? operation.entity_id) !==
                row.workout_instance_id
            )
              throw new Error('parentMismatch');
            if (
              table === 'workout_sync_conflicts' &&
              (row.kind !== operation.kind ||
                row.entity_id !== operation.entity_id ||
                !Number.isSafeInteger(row.expected_revision) ||
                typeof row.expected_revision !== 'number' ||
                row.expected_revision < 0 ||
                ![null, 'current', 'incoming'].includes(
                  row.selected_version as string | null,
                ) ||
                (row.resolved_at !== null &&
                  (typeof row.resolved_at !== 'string' ||
                    !Number.isFinite(Date.parse(row.resolved_at)))))
            )
              throw new Error('malformed');
            if (
              table === 'workout_correction_drafts' &&
              (typeof row.created_at !== 'string' ||
                !Number.isFinite(Date.parse(row.created_at)))
            )
              throw new Error('malformed');
            if (table === 'workout_correction_drafts') {
              if (
                (row.applied_at === null) !==
                  (row.applied_request_id === null) ||
                (row.applied_at !== null &&
                  (typeof row.applied_at !== 'string' ||
                    !Number.isFinite(Date.parse(row.applied_at)))) ||
                (row.applied_request_id !== null &&
                  !isExportUuid(row.applied_request_id))
              )
                throw new Error('malformed');
            } else {
              const current = row.current_version;
              if (
                !current ||
                typeof current !== 'object' ||
                Array.isArray(current)
              )
                throw new Error('malformed');
              const aggregate = current as Record<string, unknown>;
              const tableName =
                row.kind === 'finish_workout'
                  ? 'workout_instances'
                  : row.kind === 'set_note'
                    ? aggregate.shared === true
                      ? 'session_notes'
                      : 'private_notes'
                    : 'workout_exercise_id' in aggregate
                      ? 'set_results'
                      : 'workout_exercises';
              const base = Object.fromEntries(
                Object.entries(aggregate).filter(
                  ([key]) =>
                    ![
                      'sets',
                      'exercise',
                      'exercise_revision',
                      'replacements',
                      'shared',
                      'last_correction_request_id',
                    ].includes(key),
                ),
              );
              if (
                Object.keys(base).sort().join(',') !==
                Object.keys(exportRowSchemas[tableName]).sort().join(',')
              )
                throw new Error('unsupportedCurrent');
              validateJournalPart(scope, [], [{ table: tableName, row: base }]);
              if (
                (base.workout_instance_id ?? base.id) !==
                row.workout_instance_id
              )
                throw new Error('parentMismatch');
              const stripCorrection = (value: unknown): unknown => {
                if (!value || typeof value !== 'object' || Array.isArray(value))
                  return value;
                return Object.fromEntries(
                  Object.entries(value).filter(
                    ([key]) => key !== 'last_correction_request_id',
                  ),
                );
              };
              if (
                aggregate.replacements !== undefined &&
                !Array.isArray(aggregate.replacements)
              )
                throw new Error('malformed');
              const replacements = Array.isArray(aggregate.replacements)
                ? aggregate.replacements.map((candidate) => {
                    if (
                      !candidate ||
                      typeof candidate !== 'object' ||
                      Array.isArray(candidate)
                    )
                      throw new Error('malformed');
                    const replacement = candidate as Record<string, unknown>;
                    return {
                      row: stripCorrection(
                        Object.fromEntries(
                          Object.entries(replacement).filter(
                            ([key]) => key !== 'sets',
                          ),
                        ),
                      ),
                      sets: replacement.sets,
                    };
                  })
                : [];
              const currentVersion = {
                projection: { table: tableName, row: base },
                exercise:
                  aggregate.exercise == null
                    ? null
                    : {
                        table: 'workout_exercises',
                        row: stripCorrection(aggregate.exercise),
                      },
                exercise_revision: aggregate.exercise_revision ?? null,
                sets: aggregate.sets ?? [],
                replacements,
                shared: aggregate.shared ?? null,
              };
              validateJournalConflict(scope, {
                id: row.id,
                entityId: row.entity_id,
                workoutId: row.workout_instance_id,
                expectedRevision: row.expected_revision,
                current: currentVersion,
                incoming,
              });
              if (
                'last_correction_request_id' in aggregate &&
                aggregate.last_correction_request_id !== null &&
                !isExportUuid(aggregate.last_correction_request_id)
              )
                throw new Error('malformed');
              for (const candidate of [
                aggregate.exercise,
                ...(Array.isArray(aggregate.sets) ? aggregate.sets : []),
                ...(Array.isArray(aggregate.replacements)
                  ? aggregate.replacements
                  : []),
              ]) {
                if (candidate === undefined || candidate === null) continue;
                if (
                  !candidate ||
                  typeof candidate !== 'object' ||
                  Array.isArray(candidate)
                )
                  throw new Error('malformed');
                const nested = candidate as Record<string, unknown>;
                if (
                  nested.workspace_id !== scope.workspaceId ||
                  nested.workout_instance_id !== row.workout_instance_id ||
                  !isExportUuid(nested.id)
                )
                  throw new Error('parentMismatch');
                const nestedTable =
                  'workout_exercise_id' in nested
                    ? 'set_results'
                    : 'workout_exercises';
                const nestedBase = Object.fromEntries(
                  Object.entries(nested).filter(
                    ([key]) =>
                      !['sets', 'last_correction_request_id'].includes(key),
                  ),
                );
                validateJournalPart(
                  scope,
                  [],
                  [{ table: nestedTable, row: nestedBase }],
                );
                if (Array.isArray(nested.sets)) {
                  for (const child of nested.sets) {
                    if (
                      !child ||
                      typeof child !== 'object' ||
                      Array.isArray(child)
                    )
                      throw new Error('malformed');
                    const set = child as Record<string, unknown>;
                    if (
                      set.workout_instance_id !== row.workout_instance_id ||
                      set.workout_exercise_id !== nested.id
                    )
                      throw new Error('parentMismatch');
                    validateJournalPart(
                      scope,
                      [],
                      [{ table: 'set_results', row: set }],
                    );
                  }
                }
              }
            }
            for (const key of table === 'workout_sync_conflicts'
              ? ['current_version', 'incoming_operation']
              : ['operation'])
              assertSafeExportData(row[key], scope);
            if (records.length >= 10000) throw new Error('limit');
            ids.add(String(row.id));
            records.push(row);
          }
          if (response.data.length === 0) break;
          offset += response.data.length;
        }
        sources.push({
          id: table,
          state: 'incomplete',
          records,
          gaps: ['independent-server-read-no-snapshot-barrier'],
        });
      } catch {
        await boundedExportStep(options.guard(), signal, 5000);
        if (signal?.aborted) throw new Error('cancelled');
        sources.push({
          id: table,
          state: 'unknown',
          records: [],
          gaps: ['unavailable-or-unsafe-server-context'],
        });
      }
    }
    const conflicts = sources.find(
      (source) => source.id === 'workout_sync_conflicts',
    );
    const drafts = sources.find(
      (source) => source.id === 'workout_correction_drafts',
    );
    if (drafts) {
      drafts.records = drafts.records.filter((value) => {
        const row = value as Record<string, unknown>;
        const operation = row.operation as Record<string, unknown>;
        if (operation.kind !== 'resolve_conflict') return true;
        const payload = operation.payload as Record<string, unknown>;
        const linked = conflicts?.records.some((candidate) => {
          const conflict = candidate as Record<string, unknown>;
          return (
            conflict.id === payload.conflict_id &&
            conflict.workout_instance_id === row.workout_instance_id &&
            conflict.entity_id === operation.entity_id
          );
        });
        if (!linked)
          drafts.gaps.push('correction-conflict-relation-unavailable');
        return linked === true;
      });
    }
    await boundedExportStep(options.guard(), signal, 5000);
    return sources;
  };
}

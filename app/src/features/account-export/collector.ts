import * as Crypto from 'expo-crypto';
import {
  isExportUuid,
  parseAccountExport,
  type AccountExport,
} from '@/domain/account-export';
import type { Scope } from '@/domain/account-local-export';
import { snapshotUtf8Bytes } from '../workout-sync/snapshot-validation';
import { adaptLocalSnapshot } from './local-adapter';
import { AccountExportError } from './service';
import type {
  CollectedAccountExport,
  CollectedSource,
  PendingReaders,
  ServerContextReader,
  SnapshotReader,
} from './collector-types';
export type * from './collector-types';
export type CollectorInput = {
  server: AccountExport;
  scope: Scope;
  guard(): Promise<void>;
  isCurrent(): boolean;
  signal?: AbortSignal;
  local: SnapshotReader | null;
  context?: ServerContextReader;
  pending?: PendingReaders;
};
export async function boundedExportRead<T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new AccountExportError('sessionChanged');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AccountExportError('network', true)),
          15000,
        );
        abort = () => reject(new AccountExportError('sessionChanged'));
        signal?.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
  }
}
function freezeExport(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeExport(child);
    Object.freeze(value);
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
function validateSources(
  sources: CollectedSource[],
  scope: Scope,
  server: AccountExport,
): CollectedSource[] {
  const ids = new Set<string>();
  let nodes = 0;
  const walk = (value: unknown, depth = 0): void => {
    if (++nodes > 300000 || depth > 24) throw new Error('limit');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('malformed');
      return;
    }
    if (typeof value === 'string') {
      if (
        value.length > 4 * 1024 * 1024 ||
        /Bearer\s+[A-Za-z0-9._~-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\/invite\/[A-Za-z0-9_-]{32,}|(?:[?&#]|\b)(?:token|access_token|refresh_token)=/i.test(
          value,
        )
      )
        throw new Error('unsafe');
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 10000) throw new Error('limit');
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (
      !value ||
      typeof value !== 'object' ||
      Object.getPrototypeOf(value) !== Object.prototype
    )
      throw new Error('malformed');
    for (const key of Reflect.ownKeys(value)) {
      if (
        typeof key !== 'string' ||
        /token|password|authorization|secret|__proto__|constructor|prototype/i.test(
          key,
        )
      )
        throw new Error('unsafe');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        throw new Error('malformed');
      const child: unknown = descriptor.value;
      if (
        (key === 'workspace_id' || key === 'workspaceId') &&
        child !== scope.workspaceId
      )
        throw new Error('scopeMismatch');
      if (
        (key === 'account_id' ||
          key === 'accountId' ||
          key === 'author_user_id') &&
        child !== scope.accountId
      )
        throw new Error('scopeMismatch');
      walk(child, depth + 1);
    }
  };
  if (!Array.isArray(sources) || sources.length > 100)
    throw new Error('malformed');
  for (const source of sources) {
    if (
      !source ||
      Object.keys(source).sort().join(',') !== 'gaps,id,records,state' ||
      typeof source.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(source.id) ||
      ids.has(source.id) ||
      !['complete', 'incomplete', 'unknown'].includes(source.state) ||
      !Array.isArray(source.records) ||
      !Array.isArray(source.gaps) ||
      !source.gaps.every((gap) => typeof gap === 'string')
    )
      throw new Error('malformed');
    ids.add(source.id);
    if (
      source.id === 'workout_sync_conflicts' ||
      source.id === 'workout_correction_drafts'
    ) {
      for (const record of source.records) {
        if (!record || typeof record !== 'object' || Array.isArray(record))
          throw new Error('malformed');
        const row = record as Record<string, unknown>;
        if (
          !server.collections.workout_instances.some(
            (workout) => workout.id === row.workout_instance_id,
          )
        )
          throw new Error('unprovenParent');
      }
    }
    walk(source);
  }
  return sources;
}
function fingerprint(sources: CollectedSource[]): string {
  return canonical(sources.filter((source) => source.id !== 'sqlite-snapshot'));
}
export async function collectAccountExport(
  input: CollectorInput,
): Promise<CollectedAccountExport> {
  const scope = Object.freeze({ ...input.scope });
  if (
    !isExportUuid(scope.accountId) ||
    !isExportUuid(scope.workspaceId) ||
    !scope.sessionId
  )
    throw new AccountExportError('invalidInput');
  const guard = async () => {
    if (input.signal?.aborted || !input.isCurrent())
      throw new AccountExportError('sessionChanged');
    await boundedExportRead(input.guard, input.signal);
    if (input.signal?.aborted || !input.isCurrent())
      throw new AccountExportError('sessionChanged');
  };
  await guard();
  const server = parseAccountExport(input.server, {
    ownerUserId: scope.accountId,
    workspaceId: scope.workspaceId,
  });
  const read = async (): Promise<CollectedSource[]> => {
    await guard();
    const sources: CollectedSource[] = [
      {
        id: 'server-workspace',
        state: 'complete',
        records: Object.entries(server.collections).map(([table, rows]) => ({
          table,
          count: rows.length,
        })),
        gaps: [],
      },
      ...[
        'workout-preload-context',
        'workout-preload-recovery',
        'workout-entry-drafts',
        'workout-entry-resources',
        'library-exercise-pending',
        'provider-memory-forms',
        'local-demo-data',
        'device-theme-calm-settings',
        'auth-secret-storage',
        'pending-invitation-secret',
      ].map((id): CollectedSource => ({
        id,
        state: 'unknown',
        records: [],
        gaps: [
          id.includes('secret')
            ? 'credential-source-intentionally-excluded'
            : id === 'library-exercise-pending'
              ? 'no-public-read-api'
              : 'no-exhaustive-account-scoped-read-api',
        ],
      })),
    ];
    if (input.local) {
      try {
        const snapshot = await boundedExportRead(
          () =>
            input.local!.scopedSnapshot({
              expectedScope: scope,
              isCurrentSession: input.isCurrent,
              signal: input.signal,
            }),
          input.signal,
        );
        sources.push(...adaptLocalSnapshot(snapshot, scope, server));
        const content = canonical({
          operations: snapshot.operations.map((operation) => ({
            sequence: operation.sequence,
            operationId: operation.operationId,
            entityId: operation.entityId,
            confirmed: operation.confirmed,
            operationJson: operation.operationJson,
            resultJson: operation.resultJson,
          })),
          entries: snapshot.entries.map((entry) => ({
            entityId: entry.entityId,
            valueJson: entry.valueJson,
          })),
        });
        const sha256 = await boundedExportRead(
          () =>
            Crypto.digestStringAsync(
              Crypto.CryptoDigestAlgorithm.SHA256,
              content,
            ),
          input.signal,
        );
        sources.push({
          id: 'sqlite-content-fingerprint',
          state: 'complete',
          records: [{ sha256 }],
          gaps: [],
        });
      } catch {
        await guard();
        sources.push({
          id: 'sqlite-journal',
          state: 'unknown',
          records: [],
          gaps: ['local-snapshot-unavailable-or-unsafe'],
        });
      }
    } else
      sources.push({
        id: 'sqlite-journal',
        state: 'unknown',
        records: [],
        gaps: ['local-snapshot-unavailable'],
      });
    for (const [id, reader] of [
      [
        'server-conflicts-corrections',
        input.context ? () => input.context!(scope, input.signal) : undefined,
      ],
      ['local-pending-drafts', input.pending],
    ] as const) {
      if (!reader)
        sources.push({
          id,
          state: 'unknown',
          records: [],
          gaps: ['reader-unavailable'],
        });
      else {
        try {
          sources.push(
            ...validateSources(
              await boundedExportRead(reader, input.signal),
              scope,
              server,
            ),
          );
        } catch {
          await guard();
          sources.push({
            id,
            state: 'unknown',
            records: [],
            gaps: ['reader-unavailable-or-unsafe'],
          });
        }
      }
      await guard();
    }
    return validateSources(sources, scope, server);
  };
  const sources = await read();
  const captured = fingerprint(sources);
  const envelope = {
    snapshot: { id: Crypto.randomUUID(), capturedAt: new Date().toISOString() },
    format: 'panda-trainer-account' as const,
    version: 2 as const,
    scope,
    server,
    globalAtomicity: 'unknown' as const,
    status: 'incomplete' as const,
    sources,
    gaps: [
      'no-global-writer-barrier',
      'infrastructure-logs-backups-and-other-devices-not-covered',
      'operational-receipts-excluded',
      'unstored-revision-history-unavailable',
    ],
  };
  const json = JSON.stringify(envelope);
  const utf8Bytes = snapshotUtf8Bytes(json);
  if (utf8Bytes > 12 * 1024 * 1024)
    throw new AccountExportError('malformedPayload');
  const isolatedEnvelope = JSON.parse(json) as typeof envelope;
  freezeExport(isolatedEnvelope);
  await guard();
  return {
    status: 'incomplete',
    envelope: isolatedEnvelope,
    json,
    utf8Bytes,
    validate: async () => {
      if (fingerprint(await read()) !== captured)
        throw new AccountExportError('stale');
      await guard();
    },
  };
}
export function createAccountExportCollector(
  options: Pick<CollectorInput, 'local' | 'context' | 'pending'>,
) {
  return (
    server: AccountExport,
    scope: Scope,
    guard: () => Promise<void>,
    signal?: AbortSignal,
    isCurrent: () => boolean = () => !signal?.aborted,
  ) =>
    collectAccountExport({
      ...options,
      server,
      scope,
      guard,
      signal,
      isCurrent,
    });
}

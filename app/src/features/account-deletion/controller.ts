import type {
  ExportDelivery,
  ExportFileAdapter,
  ExportFileOutcome,
} from '@/features/account-export/file-contract';
import { exportUtf8Bytes } from '@/features/account-export/file-contract';
import type {
  DeletionInspection,
  DeletionIdentity,
  DeletionRequest,
  DeletionStatus,
} from './service';
import type { DeletionLocalSnapshot } from './local';
import type { ConfirmedDeletion } from './pending';
export type DeletionView =
  | 'idle'
  | 'loading'
  | 'consequences'
  | 'blocked'
  | 'ready'
  | 'exported'
  | 'confirmed'
  | 'deleting'
  | 'unknown'
  | 'complete'
  | 'cleanupRequired';
export type DeletionDependencies = {
  guard(): Promise<void>;
  inspect(): Promise<DeletionInspection>;
  read(): Promise<DeletionLocalSnapshot>;
  hash(json: string): Promise<string>;
  uuid(): string;
  secret(): string;
  file: ExportFileAdapter;
  persist(intent: ConfirmedDeletion): Promise<void>;
  shutdown(): Promise<void>;
  fence?(snapshot: DeletionLocalSnapshot): Promise<void>;
  send(
    action: 'delete' | 'status',
    request: DeletionRequest,
    bearer?: string,
  ): Promise<DeletionStatus>;
  cleanup(snapshot: DeletionLocalSnapshot): Promise<void>;
  canResumeCleanup?(fingerprint: string): Promise<boolean>;
  clear(intent: ConfirmedDeletion): Promise<void>;
  publish(
    view: DeletionView,
    inspection?: DeletionInspection,
    outstanding?: number,
  ): void;
};
export function createDeletionController(
  identity: DeletionIdentity,
  deps: DeletionDependencies,
  restored: ConfirmedDeletion | null = null,
) {
  identity = Object.freeze({ ...identity });
  let current = true;
  let busy = false;
  let inspection: DeletionInspection | undefined;
  let snapshot: DeletionLocalSnapshot | null = null;
  let exported: ExportFileOutcome['evidence'] = null;
  let delivery: ExportDelivery | null = null;
  let intent: ConfirmedDeletion | null = restored
    ? Object.freeze({ ...restored })
    : null;
  let intentPersisted = restored !== null;
  let acknowledged = false;
  const publish = (view: DeletionView) => {
    if (current) deps.publish(view, inspection, snapshot?.outstanding);
  };
  const guard = async () => {
    if (!current) throw new Error('dismissed');
    await deps.guard();
    if (!current) throw new Error('dismissed');
  };
  const run = async (task: () => Promise<void>) => {
    if (!current || busy) return;
    busy = true;
    try {
      await task();
    } catch {
      publish(intent ? 'unknown' : 'blocked');
    } finally {
      busy = false;
    }
  };
  const fresh = async () => {
    await guard();
    const next = await deps.read();
    if (
      !snapshot ||
      next.accountId !== identity.accountId ||
      next.fingerprint !== snapshot.fingerprint
    ) {
      exported = null;
      acknowledged = false;
      throw new Error('snapshot_changed');
    }
    await guard();
    return next;
  };
  const finish = async () => {
    if (!intent) throw new Error('missing_intent');
    try {
      const next = await deps.read();
      if (
        next.accountId !== intent.accountId ||
        (next.fingerprint !== intent.fingerprint &&
          !(await deps.canResumeCleanup?.(intent.fingerprint))) ||
        next.outstanding !== 0
      )
        throw new Error('local_changed');
      await deps.cleanup(next);
      await deps.clear(intent);
      publish('complete');
    } catch {
      publish('cleanupRequired');
    }
  };
  return {
    explain: () =>
      run(async () => {
        await guard();
        publish('loading');
        inspection = await deps.inspect();
        await guard();
        publish('consequences');
      }),
    prepare: () =>
      run(async () => {
        exported = null;
        acknowledged = false;
        await guard();
        publish('loading');
        snapshot = await deps.read();
        await guard();
        if (snapshot.accountId !== identity.accountId) throw new Error('scope');
        publish(snapshot.outstanding ? 'blocked' : 'ready');
      }),
    export: () =>
      run(async () => {
        acknowledged = false;
        if (!snapshot) throw new Error('missing_snapshot');
        const next = await fresh();
        if (!identity.sessionId) throw new Error('session_unknown');
        const snapshotId = deps.uuid();
        const json = JSON.stringify({
          format: 'panda-trainer-deletion-local',
          version: 1,
          accountId: identity.accountId,
          sessionId: identity.sessionId,
          snapshotId,
          fingerprint: next.fingerprint,
          globalAtomicity: 'unknown',
          sources: next.records,
        });
        delivery = {
          snapshotId,
          sessionId: identity.sessionId,
          sha256: await deps.hash(json),
          utf8Bytes: exportUtf8Bytes(json),
        };
        const outcome = await deps.file(
          json,
          { userId: identity.accountId, workspaceId: identity.accountId },
          async () => {
            await fresh();
          },
          delivery,
        );
        await fresh();
        const proof = outcome.evidence;
        if (outcome.result === 'cancelled') {
          publish(next.outstanding ? 'blocked' : 'ready');
          return;
        }
        if (
          !proof ||
          proof.userId !== identity.accountId ||
          proof.workspaceId !== identity.accountId ||
          proof.snapshotId !== delivery.snapshotId ||
          proof.sessionId !== delivery.sessionId ||
          proof.sha256 !== delivery.sha256 ||
          proof.utf8Bytes !== delivery.utf8Bytes ||
          proof.disposition !== outcome.result ||
          proof.exactUtf8 !== true ||
          proof.verification !== 'adapter-reported'
        )
          throw new Error('file_unknown');
        exported = proof;
        publish(next.outstanding ? 'blocked' : 'exported');
      }),
    acknowledge: () =>
      run(async () => {
        const next = await fresh();
        if (!exported || next.outstanding !== 0) throw new Error('blocked');
        acknowledged = true;
        publish('confirmed');
      }),
    delete: () =>
      run(async () => {
        const next = await fresh();
        if (
          !acknowledged ||
          !inspection ||
          !exported ||
          !delivery ||
          next.outstanding !== 0 ||
          intent
        )
          throw new Error('blocked');
        const renewed = await deps.inspect();
        if (JSON.stringify(renewed) !== JSON.stringify(inspection))
          throw new Error('scope_changed');
        await fresh();
        intent = Object.freeze({
          requestId: deps.uuid(),
          recoveryToken: deps.secret(),
          accountId: identity.accountId,
          fingerprint: next.fingerprint,
          exportSha256: delivery.sha256,
          exportBytes: delivery.utf8Bytes,
          snapshotId: delivery.snapshotId,
          confirmed: true,
        });
        await deps.persist(intent);
        intentPersisted = true;
        await guard();
        publish('deleting');
        await deps.shutdown();
        const last = await deps.read();
        if (last.fingerprint !== intent.fingerprint || last.outstanding !== 0)
          throw new Error('local_changed');
        await deps.fence?.(last);
        if ((await deps.send('delete', intent, identity.token)) === 'complete')
          await finish();
        else publish('unknown');
      }),
    recover: () =>
      run(async () => {
        if (!intent || intent.accountId !== identity.accountId)
          throw new Error('missing_intent');
        if (!intentPersisted) {
          await deps.persist(intent);
          intentPersisted = true;
        }
        publish('deleting');
        let status: DeletionStatus | null = null;
        try {
          status = await deps.send('status', intent);
        } catch {
          if (!identity.token) throw new Error('recovery_unknown');
        }
        if (status === 'complete') {
          await finish();
          return;
        }
        const next = await deps.read();
        if (
          next.accountId !== intent.accountId ||
          next.fingerprint !== intent.fingerprint ||
          next.outstanding !== 0
        )
          throw new Error('local_changed');
        await deps.fence?.(next);
        if (identity.token) {
          await deps.shutdown();
        }
        if (
          (await deps.send(
            'delete',
            intent,
            status === null ? identity.token : undefined,
          )) === 'complete'
        )
          await finish();
        else publish('unknown');
      }),
    exportRecovery: () =>
      run(async () => {
        if (!intent) throw new Error('missing_intent');
        const next = await deps.read();
        if (next.accountId !== intent.accountId) throw new Error('scope');
        const snapshotId = deps.uuid();
        const json = JSON.stringify({
          format: 'panda-trainer-deletion-recovery-local',
          version: 1,
          accountId: intent.accountId,
          snapshotId,
          fingerprint: next.fingerprint,
          globalAtomicity: 'unknown',
          sources: next.records,
        });
        const delivery = {
          snapshotId,
          sessionId: snapshotId,
          sha256: await deps.hash(json),
          utf8Bytes: exportUtf8Bytes(json),
        };
        await deps.file(
          json,
          { userId: intent.accountId, workspaceId: intent.accountId },
          async () => {
            const after = await deps.read();
            if (
              !current ||
              after.accountId !== intent!.accountId ||
              after.fingerprint !== next.fingerprint
            )
              throw new Error('local_changed');
          },
          delivery,
        );
        publish('unknown');
      }),
    cancel: () => {
      if (intent) return;
      current = false;
      exported = null;
      snapshot = null;
    },
    stop: () => {
      current = false;
      exported = null;
      snapshot = null;
    },
  };
}

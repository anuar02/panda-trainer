import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import type { AccountExport } from '@/domain/account-export';
import type { Scope } from '@/domain/account-local-export';
import {
  AccountExportError,
  boundedExportStep,
  exportSessionIdentity,
  loadAccountExport,
  type AccountExportErrorCode,
  type AccountExportTransport,
} from './service';
import {
  createAccountExportCollector,
  type CollectedAccountExport,
} from './collector';
import {
  ExportFileError,
  type ExportDelivery,
  type ExportFileAdapter,
  type ExportFileErrorCode,
  type ExportFileOutcome,
  type ExportFileResult,
} from './file-contract';

export type ExportScope = {
  userId: string;
  workspaceId: string;
  token: string;
};
export type ExportStatus =
  | 'cancelling'
  | 'idle'
  | 'loading'
  | 'ready'
  | 'readyIncomplete'
  | 'saving'
  | ExportFileResult
  | AccountExportErrorCode
  | ExportFileErrorCode;
export type ExportDetails = {
  utf8Bytes: number;
  status: 'incomplete';
  globalAtomicity: 'unknown';
  sources: {
    id: string;
    state: 'complete' | 'incomplete' | 'unknown';
    count: number;
    gaps: string[];
  }[];
  gaps: string[];
  evidence: ExportFileOutcome['evidence'];
};
export type AccountExportCollector = (
  server: AccountExport,
  scope: Scope,
  guard: () => Promise<void>,
  signal: AbortSignal,
  isCurrent: () => boolean,
) => Promise<CollectedAccountExport>;
export function createExportController(
  transport: AccountExportTransport,
  scope: ExportScope,
  file: ExportFileAdapter,
  publish: (status: ExportStatus, details?: ExportDetails) => void,
  isCurrent: () => boolean = () => true,
  collect: AccountExportCollector = createAccountExportCollector({
    local: null,
  }),
) {
  scope = Object.freeze({ ...scope });
  let generation = 0;
  let busy = false;
  let prepared: {
    collected: CollectedAccountExport;
    delivery: ExportDelivery;
    details: ExportDetails;
    serverSignature: string;
  } | null = null;
  let active = true;
  let abort: AbortController | null = null;
  const cancel = () => {
    generation += 1;
    abort?.abort();
    prepared = null;
    if (active && isCurrent()) publish(busy ? 'cancelling' : 'cancelled');
  };
  const guardFor =
    (ticket: number, signal: AbortSignal, sessionId: string) => async () => {
      const current = () =>
        active && isCurrent() && ticket === generation && !signal.aborted;
      if (!current()) throw new AccountExportError('sessionChanged');
      const result = await boundedExportStep(
        transport.auth.getSession(),
        signal,
      );
      if (result.error) throw new AccountExportError('network');
      const identity = exportSessionIdentity(result.data.session);
      if (
        !current() ||
        identity.userId !== scope.userId ||
        identity.token !== scope.token ||
        identity.sessionId !== sessionId
      )
        throw new AccountExportError('sessionChanged');
    };
  const run = async (saving: boolean) => {
    if (!active || !isCurrent() || busy || (saving && !prepared)) return;
    busy = true;
    const ticket = saving ? generation : ++generation;
    const operationAbort = saving && abort ? abort : new AbortController();
    abort = operationAbort;
    let success = false;
    let cleanupFailed = false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    publish(saving ? 'saving' : 'loading', prepared?.details);
    try {
      const identity = exportSessionIdentity({
        user: { id: scope.userId },
        access_token: scope.token,
      });
      const guard = guardFor(ticket, operationAbort.signal, identity.sessionId);
      const validateSnapshot = (
        collected: CollectedAccountExport,
        serverSignature: string,
      ) =>
        boundedExportStep(
          (async () => {
            await guard();
            const currentServer = await loadAccountExport(transport, {
              expectedUserId: scope.userId,
              workspaceId: scope.workspaceId,
              expectedToken: identity.token,
              expectedSessionId: identity.sessionId,
              signal: operationAbort.signal,
            });
            if (
              JSON.stringify({ ...currentServer, exported_at: '' }) !==
              serverSignature
            )
              throw new AccountExportError('stale');
            await guard();
            await boundedExportStep(
              collected.validate(),
              operationAbort.signal,
              15000,
              'stale',
            );
            await guard();
          })(),
          operationAbort.signal,
          15000,
          'stale',
        );
      if (saving) {
        const snapshot = prepared!;
        prepared = null;
        const fileGuard = () =>
          validateSnapshot(snapshot.collected, snapshot.serverSignature);
        const result = await Promise.race([
          file(snapshot.collected.json, scope, fileGuard, snapshot.delivery),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              operationAbort.abort();
              reject(new ExportFileError('storage'));
            }, 30000);
          }),
        ]);
        await fileGuard();
        const evidence = result.evidence;
        if (
          result.result !== 'cancelled' &&
          (!evidence ||
            evidence.userId !== scope.userId ||
            evidence.workspaceId !== scope.workspaceId ||
            evidence.sessionId !== identity.sessionId ||
            evidence.snapshotId !== snapshot.delivery.snapshotId ||
            evidence.utf8Bytes !== snapshot.delivery.utf8Bytes ||
            evidence.sha256 !== snapshot.delivery.sha256 ||
            evidence.disposition !== result.result ||
            evidence.exactUtf8 !== true ||
            evidence.freshness !== 'unknown' ||
            evidence.globalAtomicity !== 'unknown' ||
            evidence.verification !== 'adapter-reported')
        )
          throw new ExportFileError('storage');
        publish(result.result, { ...snapshot.details, evidence });
      } else {
        prepared = null;
        await guard();
        const server = await loadAccountExport(transport, {
          expectedUserId: scope.userId,
          workspaceId: scope.workspaceId,
          expectedToken: identity.token,
          expectedSessionId: identity.sessionId,
          signal: operationAbort.signal,
        });
        await guard();
        const serverSignature = JSON.stringify({ ...server, exported_at: '' });
        const collected = await boundedExportStep(
          collect(
            server,
            {
              accountId: scope.userId,
              workspaceId: scope.workspaceId,
              sessionId: identity.sessionId,
            },
            guard,
            operationAbort.signal,
            () =>
              active &&
              isCurrent() &&
              ticket === generation &&
              !operationAbort.signal.aborted,
          ),
          operationAbort.signal,
        );
        await guard();
        const sha256 = await boundedExportStep(
          digestStringAsync(CryptoDigestAlgorithm.SHA256, collected.json),
          operationAbort.signal,
        );
        await guard();
        await validateSnapshot(collected, serverSignature);
        const delivery = {
          snapshotId: collected.envelope.snapshot.id,
          sessionId: identity.sessionId,
          utf8Bytes: collected.utf8Bytes,
          sha256,
        };
        const details: ExportDetails = {
          utf8Bytes: collected.utf8Bytes,
          status: collected.status,
          globalAtomicity: collected.envelope.globalAtomicity,
          sources: collected.envelope.sources.map((source) => ({
            id: source.id,
            state: source.state,
            count:
              source.id === 'server-workspace'
                ? Object.values(collected.envelope.server.collections).reduce(
                    (count, rows) => count + rows.length,
                    0,
                  )
                : source.records.length,
            gaps: [...source.gaps],
          })),
          gaps: [...collected.envelope.gaps],
          evidence: null,
        };
        prepared = { collected, delivery, details, serverSignature };
        publish('readyIncomplete', details);
      }
      success = true;
    } catch (error: unknown) {
      prepared = null;
      if (timer) clearTimeout(timer);
      cleanupFailed =
        error instanceof ExportFileError && error.code === 'cleanup';
      let errorStatus: ExportStatus =
        timedOut && !cleanupFailed
          ? 'storage'
          : error instanceof AccountExportError ||
              error instanceof ExportFileError
            ? error.code
            : saving
              ? 'storage'
              : 'network';
      const canPublish = () =>
        active && isCurrent() && (generation === ticket || cleanupFailed);
      const expired =
        timedOut || (error instanceof AccountExportError && error.timedOut);
      if (
        canPublish() &&
        !expired &&
        !operationAbort.signal.aborted &&
        errorStatus !== 'sessionChanged'
      ) {
        try {
          const result = await boundedExportStep(
            transport.auth.getSession(),
            undefined,
            5000,
          );
          const current = exportSessionIdentity(result.data.session);
          const expected = exportSessionIdentity({
            user: { id: scope.userId },
            access_token: scope.token,
          });
          if (
            result.error ||
            current.userId !== scope.userId ||
            current.token !== scope.token ||
            current.sessionId !== expected.sessionId
          )
            errorStatus = 'sessionChanged';
        } catch {
          errorStatus = 'sessionChanged';
        }
      }
      if (canPublish()) publish(errorStatus);
    } finally {
      if (timer) clearTimeout(timer);
      if (!success || saving) operationAbort.abort();
      busy = false;
      if (active && isCurrent() && generation !== ticket && !cleanupFailed)
        publish('cancelled');
    }
  };
  return {
    prepare: () => run(false),
    save: () => run(true),
    cancel,
    stop: () => {
      active = false;
      cancel();
    },
  };
}

import { parseAccountExport } from '@/domain/account-export';
import {
  AccountExportError,
  loadAccountExport,
  type AccountExportErrorCode,
  type AccountExportTransport,
} from './service';
import {
  ExportFileError,
  type ExportFileAdapter,
  type ExportFileErrorCode,
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
  | 'saving'
  | ExportFileResult
  | AccountExportErrorCode
  | ExportFileErrorCode;
export function createExportController(
  transport: AccountExportTransport,
  scope: ExportScope,
  file: ExportFileAdapter,
  publish: (status: ExportStatus) => void,
  isCurrent: () => boolean = () => true,
) {
  let generation = 0;
  let busy = false;
  let json: string | null = null;
  let active = true;
  let abort: AbortController | null = null;
  const cancel = () => {
    generation += 1;
    abort?.abort();
    json = null;
    if (active) publish(busy ? 'cancelling' : 'cancelled');
  };
  const guardFor = (ticket: number) => async () => {
    if (!active || !isCurrent() || ticket !== generation)
      throw new AccountExportError('sessionChanged');
    const result = await transport.auth.getSession().catch(() => {
      throw new AccountExportError('network');
    });
    if (result.error) throw new AccountExportError('network');
    if (
      !active ||
      !isCurrent() ||
      ticket !== generation ||
      result.data.session?.user.id !== scope.userId ||
      result.data.session?.access_token !== scope.token
    )
      throw new AccountExportError('sessionChanged');
  };
  const run = async (saving: boolean) => {
    if (!active || busy || (saving && json === null)) return;
    busy = true;
    const ticket = ++generation;
    const guard = guardFor(ticket);
    let cleanupFailed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    publish(saving ? 'saving' : 'loading');
    try {
      if (saving) {
        const content = json;
        json = null;
        if (content === null) return;
        const result = await file(content, scope, guard);
        await guard();
        publish(result);
      } else {
        json = null;
        const readAbort = new AbortController();
        abort = readAbort;
        const read = (async () => {
          await guard();
          return loadAccountExport(transport, {
            expectedUserId: scope.userId,
            workspaceId: scope.workspaceId,
            signal: readAbort.signal,
          });
        })();
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            readAbort.abort();
            reject(new AccountExportError('network'));
          }, 30000);
        });
        const snapshot = await Promise.race([read, timeout]);
        await guard();
        json = JSON.stringify(
          parseAccountExport(snapshot, {
            ownerUserId: scope.userId,
            workspaceId: scope.workspaceId,
          }),
        );
        publish('ready');
      }
    } catch (error: unknown) {
      json = null;
      cleanupFailed =
        error instanceof ExportFileError && error.code === 'cleanup';
      if (active && isCurrent() && (generation === ticket || cleanupFailed))
        publish(
          error instanceof AccountExportError ||
            error instanceof ExportFileError
            ? error.code
            : saving
              ? 'storage'
              : 'network',
        );
    } finally {
      if (timer) clearTimeout(timer);
      abort = null;
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

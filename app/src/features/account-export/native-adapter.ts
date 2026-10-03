import { ExportFileError, type ExportFileAdapter } from './file-contract';
import { AccountExportError } from './service';

export type NativeFileApi = {
  platform: string;
  cache: string | null;
  id(): string;
  pick(): Promise<{ granted: boolean; directoryUri?: string }>;
  create(directory: string, name: string): Promise<string>;
  write(uri: string, json: string): Promise<void>;
  remove(uri: string): Promise<void>;
  share(uri: string): Promise<'shared' | 'cancelled'>;
};
export function createNativeExportAdapter(
  api: NativeFileApi,
): ExportFileAdapter {
  return async (json, scope, guard) => {
    if (!['ios', 'android'].includes(api.platform))
      throw new ExportFileError('unsupported');
    let uri: string | null = null;
    let saved = false;
    let phase: 'storage' | 'share' = 'storage';
    try {
      await guard();
      const name = `trainer-export-v1-${api.id()}.json`;
      if (api.platform === 'android') {
        const permission = await api.pick();
        if (!permission.granted || !permission.directoryUri) return 'cancelled';
        await guard();
        uri = await api.create(permission.directoryUri, name);
      } else {
        if (!api.cache) throw new ExportFileError('unsupported');
        uri = `${api.cache}trainer-export-${scope.userId}-${scope.workspaceId}-${name}`;
      }
      await guard();
      await api.write(uri, json);
      await guard();
      if (api.platform === 'android') {
        saved = true;
        return 'saved';
      }
      phase = 'share';
      return await api.share(uri);
    } catch (error: unknown) {
      if (
        error instanceof AccountExportError ||
        error instanceof ExportFileError
      )
        throw error;
      throw new ExportFileError(phase);
    } finally {
      if (uri && !saved) {
        try {
          await api.remove(uri);
        } catch {
          throw new ExportFileError('cleanup');
        }
      }
    }
  };
}

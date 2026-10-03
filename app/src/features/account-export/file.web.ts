import { ExportFileError, type ExportFileAdapter } from './file-contract';

type Writer = {
  write(content: Blob): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
};
type Picker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable(): Promise<Writer> }>;
export function createWebExportAdapter(picker?: Picker): ExportFileAdapter {
  return async (json, _scope, guard) => {
    if (!picker) throw new ExportFileError('unsupported');
    let writer: Writer | undefined;
    let closed = false;
    try {
      const handle = await picker({
        suggestedName: 'trainer-export-v1.json',
        types: [
          { description: 'JSON', accept: { 'application/json': ['.json'] } },
        ],
      });
      await guard();
      writer = await handle.createWritable();
      await guard();
      await writer.write(
        new Blob([json], { type: 'application/json;charset=utf-8' }),
      );
      await guard();
      await writer.close();
      closed = true;
      return 'saved';
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError')
        return 'cancelled';
      if (error instanceof Error && error.name === 'AccountExportError')
        throw error;
      throw new ExportFileError('storage');
    } finally {
      if (writer && !closed) {
        try {
          await writer.abort();
        } catch {
          throw new ExportFileError('cleanup');
        }
      }
    }
  };
}
const picker = (
  globalThis as typeof globalThis & { showSaveFilePicker?: Picker }
).showSaveFilePicker;
export const saveExportFile = createWebExportAdapter(picker?.bind(globalThis));

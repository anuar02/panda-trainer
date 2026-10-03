export type ExportFileResult = 'saved' | 'shared' | 'cancelled';
export type ExportFileErrorCode =
  'unsupported' | 'storage' | 'share' | 'cleanup';
export class ExportFileError extends Error {
  constructor(readonly code: ExportFileErrorCode) {
    super(code);
    this.name = 'ExportFileError';
  }
}
export type ExportFileAdapter = (
  json: string,
  scope: { userId: string; workspaceId: string },
  guard: () => Promise<void>,
) => Promise<ExportFileResult>;

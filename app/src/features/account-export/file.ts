import { ExportFileError, type ExportFileAdapter } from './file-contract';

export const saveExportFile: ExportFileAdapter = async () => {
  throw new ExportFileError('unsupported');
};

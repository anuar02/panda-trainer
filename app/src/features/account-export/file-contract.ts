import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
export type ExportFileResult = 'saved' | 'shared' | 'cancelled';
export type ExportFileErrorCode =
  'unsupported' | 'storage' | 'share' | 'cleanup';
export class ExportFileError extends Error {
  constructor(readonly code: ExportFileErrorCode) {
    super(code);
    this.name = 'ExportFileError';
  }
}
export type ExportFileScope = { userId: string; workspaceId: string };
export type ExportDelivery = {
  snapshotId: string;
  sessionId: string;
  utf8Bytes: number;
  sha256: string;
};
export type ExportFileOutcome = {
  result: ExportFileResult;
  evidence:
    | null
    | (ExportDelivery &
        ExportFileScope & {
          disposition: 'saved' | 'shared';
          exactUtf8: true;
          freshness: 'unknown';
          globalAtomicity: 'unknown';
          verification: 'adapter-reported';
        });
};
export function exportUtf8Bytes(json: string): number {
  let bytes = 0;
  for (const character of json) {
    const point = character.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff)
      throw new ExportFileError('storage');
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}
export async function exportFileOutcome(
  result: ExportFileResult,
  json: string,
  scope: ExportFileScope,
  delivery?: ExportDelivery,
): Promise<ExportFileOutcome> {
  if (result === 'cancelled') return { result, evidence: null };
  const bytes = exportUtf8Bytes(json);
  const sha256 = await digestStringAsync(CryptoDigestAlgorithm.SHA256, json);
  if (delivery && (delivery.utf8Bytes !== bytes || delivery.sha256 !== sha256))
    throw new ExportFileError('storage');
  return {
    result,
    evidence: delivery
      ? {
          ...scope,
          ...delivery,
          disposition: result,
          exactUtf8: true,
          freshness: 'unknown',
          globalAtomicity: 'unknown',
          verification: 'adapter-reported',
        }
      : null,
  };
}
export type ExportFileAdapter = (
  json: string,
  scope: ExportFileScope,
  guard: () => Promise<void>,
  delivery?: ExportDelivery,
) => Promise<ExportFileOutcome>;

export async function boundedExportCleanup(
  operation: Promise<void>,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ExportFileError('cleanup')), 5000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

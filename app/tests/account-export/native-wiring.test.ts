import { Share } from 'react-native';
import {
  writeAsStringAsync,
  deleteAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { saveExportFile } from '@/features/account-export/file.native';
import snapshot from './snapshot.json';
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'synthetic-file',
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn(async () => 'synthetic-digest'),
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    createFileAsync: jest.fn(),
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Share, 'share');
});
test('iOS wiring writes exact JSON as UTF-8, passes file URL and cleans on dismissed share', async () => {
  jest.mocked(Share.share).mockResolvedValue({ action: Share.dismissedAction });
  const json = JSON.stringify(snapshot);
  const scope = {
    userId: snapshot.owner_user_id,
    workspaceId: snapshot.workspace_id,
  };
  expect(await saveExportFile(json, scope, async () => undefined)).toEqual({
    result: 'cancelled',
    evidence: null,
  });
  const uri = jest.mocked(writeAsStringAsync).mock.calls[0]?.[0];
  expect(writeAsStringAsync).toHaveBeenCalledWith(uri, json, {
    encoding: EncodingType.UTF8,
  });
  expect(Share.share).toHaveBeenCalledWith({ url: uri });
  expect(deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
});
test('iOS rejected share cleans temp and reports share error', async () => {
  jest
    .mocked(Share.share)
    .mockRejectedValueOnce(new Error('synthetic share error'));
  await expect(
    saveExportFile(
      '{}',
      { userId: 'synthetic', workspaceId: 'synthetic' },
      async () => undefined,
    ),
  ).rejects.toMatchObject({ code: 'share' });
  expect(deleteAsync).toHaveBeenCalledTimes(1);
});

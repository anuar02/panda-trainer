import { Platform, Share } from 'react-native';
import { randomUUID } from 'expo-crypto';
import {
  cacheDirectory,
  deleteAsync,
  writeAsStringAsync,
  EncodingType,
  StorageAccessFramework,
} from 'expo-file-system/legacy';
import { ExportFileError } from './file-contract';
import { createNativeExportAdapter } from './native-adapter';

export const saveExportFile = createNativeExportAdapter({
  platform: Platform.OS,
  cache: cacheDirectory,
  id: randomUUID,
  pick: () => StorageAccessFramework.requestDirectoryPermissionsAsync(),
  create: (directory, name) =>
    StorageAccessFramework.createFileAsync(directory, name, 'application/json'),
  write: (uri, json) =>
    writeAsStringAsync(uri, json, { encoding: EncodingType.UTF8 }),
  remove: (uri) => deleteAsync(uri, { idempotent: true }),
  share: async (uri) => {
    const result = await Share.share({ url: uri });
    if (result.action === Share.dismissedAction) return 'cancelled';
    if (result.action === Share.sharedAction) return 'shared';
    throw new ExportFileError('share');
  },
});

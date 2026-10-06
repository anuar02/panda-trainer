import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import {
  boundedExportStep,
  exportSessionIdentity,
} from '@/features/account-export/service';
import {
  exportFileOutcome,
  exportUtf8Bytes,
} from '@/features/account-export/file-contract';
import { syntheticSessionId, syntheticToken } from './test-transport';
const userId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
test('same user relogin has different session identity; token refresh preserves identity', () => {
  const identity = exportSessionIdentity({
    user: { id: userId },
    access_token: syntheticToken(userId),
  });
  const refreshed = exportSessionIdentity({
    user: { id: userId },
    access_token: syntheticToken(userId, syntheticSessionId, 'refresh'),
  });
  const relogin = exportSessionIdentity({
    user: { id: userId },
    access_token: syntheticToken(userId, workspaceId),
  });
  expect(refreshed.sessionId).toBe(identity.sessionId);
  expect(refreshed.token).not.toBe(identity.token);
  expect(relogin.sessionId).not.toBe(identity.sessionId);
});
test.each(['synthetic-invalid', 'a.b.c', syntheticToken(workspaceId)])(
  'wrong or malformed JWT cannot supply export identity %#',
  (token) => {
    expect(() =>
      exportSessionIdentity({ user: { id: userId }, access_token: token }),
    ).toThrow('sessionChanged');
  },
);
test('bounded auth guard rejects and ignores a late result', async () => {
  jest.useFakeTimers();
  try {
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const result = boundedExportStep(pending, undefined, 50);
    const rejection = expect(result).rejects.toMatchObject({ code: 'network' });
    await jest.advanceTimersByTimeAsync(50);
    await rejection;
    resolve('late');
    await Promise.resolve();
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});
test('delivery evidence includes exact byte identity and cancellation never grants evidence', async () => {
  const json = '{"text":"🐼я"}';
  const delivery = {
    sha256: await digestStringAsync(CryptoDigestAlgorithm.SHA256, json),
    snapshotId: 'snapshot',
    sessionId: syntheticSessionId,
    utf8Bytes: Buffer.byteLength(json, 'utf8'),
  };
  expect(exportUtf8Bytes(json)).toBe(delivery.utf8Bytes);
  expect(
    await exportFileOutcome('shared', json, { userId, workspaceId }, delivery),
  ).toEqual({
    result: 'shared',
    evidence: {
      ...delivery,
      userId,
      workspaceId,
      disposition: 'shared',
      freshness: 'unknown',
      globalAtomicity: 'unknown',
      verification: 'adapter-reported',
      exactUtf8: true,
    },
  });
  expect(
    await exportFileOutcome(
      'cancelled',
      json,
      { userId, workspaceId },
      delivery,
    ),
  ).toEqual({ result: 'cancelled', evidence: null });
  await expect(
    exportFileOutcome(
      'saved',
      json,
      { userId, workspaceId },
      { ...delivery, utf8Bytes: delivery.utf8Bytes - 1 },
    ),
  ).rejects.toThrow('storage');
  expect(() => exportUtf8Bytes('\ud800')).toThrow('storage');
});
test('equal byte count with another content hash never supplies delivery evidence', async () => {
  const json = '{"text":"one"}';
  const sha256 = '0'.repeat(64);
  await expect(
    exportFileOutcome(
      'saved',
      json,
      { userId, workspaceId },
      {
        snapshotId: 'synthetic',
        sessionId: syntheticSessionId,
        utf8Bytes: Buffer.byteLength(json),
        sha256,
      },
    ),
  ).rejects.toThrow('storage');
});

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SupportedStorage } from '@supabase/supabase-js';

const codePointsPerChunk = 450;
const maximumChunks = 4096;
const manifestSuffix = '__manifest';
const generationSuffix = '__g_';
const chunkSuffix = '__c_';
const mutationQueues = new Map<string, Promise<void>>();

type Manifest = { generation: string; chunks: number };

const serialize = async <T>(key: string, operation: () => Promise<T>) => {
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  mutationQueues.set(key, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (mutationQueues.get(key) === queued) mutationQueues.delete(key);
  }
};

const generationPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const readManifest = async (key: string): Promise<Manifest | null> => {
  try {
    const raw = await SecureStore.getItemAsync(`${key}${manifestSuffix}`);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'generation' in value &&
      typeof value.generation === 'string' &&
      generationPattern.test(value.generation) &&
      'chunks' in value &&
      typeof value.chunks === 'number' &&
      Number.isInteger(value.chunks) &&
      value.chunks > 0 &&
      value.chunks <= maximumChunks
    )
      return { generation: value.generation, chunks: value.chunks };
    throw new Error('Invalid secure session manifest');
  } catch (error) {
    throw new Error('Unable to read the secure session manifest', {
      cause: error,
    });
  }
};

const readValue = async (key: string) => {
  const manifest = await readManifest(key);
  if (!manifest) return null;
  const pieces = await Promise.all(
    Array.from({ length: manifest.chunks }, (_, index) =>
      SecureStore.getItemAsync(
        `${key}${generationSuffix}${manifest.generation}${chunkSuffix}${index}`,
      ),
    ),
  );
  if (pieces.some((piece) => piece === null))
    throw new Error('Secure session storage is incomplete');
  return pieces.join('');
};

const removeGeneration = async (key: string, manifest: Manifest) => {
  await Promise.all(
    Array.from({ length: manifest.chunks }, (_, index) =>
      SecureStore.deleteItemAsync(
        `${key}${generationSuffix}${manifest.generation}${chunkSuffix}${index}`,
      ),
    ),
  );
};

const writeValue = async (key: string, value: string) => {
  const oldManifest = await readManifest(key);
  const points = Array.from(value);
  const chunks = Array.from(
    { length: Math.max(1, Math.ceil(points.length / codePointsPerChunk)) },
    (_, index) =>
      points
        .slice(index * codePointsPerChunk, (index + 1) * codePointsPerChunk)
        .join(''),
  );
  if (chunks.length > maximumChunks)
    throw new Error('Secure session exceeds the supported size');
  const generation = Crypto.randomUUID();
  const entries = chunks.map((chunk, index) => ({
    key: `${key}${generationSuffix}${generation}${chunkSuffix}${index}`,
    chunk,
  }));
  const writes = await Promise.allSettled(
    entries.map((entry) => SecureStore.setItemAsync(entry.key, entry.chunk)),
  );
  const failedWrite = writes.find((result) => result.status === 'rejected');
  if (failedWrite) {
    await Promise.all(
      entries.map((entry) =>
        SecureStore.deleteItemAsync(entry.key).catch(() => undefined),
      ),
    );
    throw new Error('Unable to save the secure session', {
      cause: failedWrite.reason,
    });
  }
  try {
    await SecureStore.setItemAsync(
      `${key}${manifestSuffix}`,
      JSON.stringify({ generation, chunks: chunks.length }),
    );
  } catch (error) {
    await Promise.all(
      entries.map((entry) =>
        SecureStore.deleteItemAsync(entry.key).catch(() => undefined),
      ),
    );
    throw new Error('Unable to save the secure session', { cause: error });
  }
  if (oldManifest) await removeGeneration(key, oldManifest);
};

const nativeStorage: SupportedStorage = {
  getItem: (key) => serialize(key, () => readValue(key)),
  setItem: (key, value) => serialize(key, () => writeValue(key, value)),
  removeItem: (key) =>
    serialize(key, async () => {
      const manifest = await readManifest(key);
      await SecureStore.deleteItemAsync(`${key}${manifestSuffix}`);
      if (manifest) await removeGeneration(key, manifest);
    }),
};

const webStorage: SupportedStorage = {
  getItem: async (key) => {
    if (typeof window === 'undefined') return null;
    try {
      return window.sessionStorage.getItem(key);
    } catch (error) {
      throw new Error('Unable to read the browser session', { cause: error });
    }
  },
  setItem: async (key, value) => {
    if (typeof window === 'undefined')
      throw new Error('Browser session storage is unavailable');
    try {
      window.sessionStorage.setItem(key, value);
    } catch (error) {
      throw new Error('Unable to save the browser session', { cause: error });
    }
  },
  removeItem: async (key) => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(key);
    } catch (error) {
      throw new Error('Unable to remove the browser session', { cause: error });
    }
  },
};

export const authStorage: SupportedStorage =
  Platform.OS === 'web' ? webStorage : nativeStorage;

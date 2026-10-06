import * as SecureStore from 'expo-secure-store';
import { authStorage } from '../src/features/auth/storage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => {
  let counter = 0;
  return {
    randomUUID: jest.fn(() => {
      counter += 1;
      return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    }),
  };
});

const getItem = jest.mocked(SecureStore.getItemAsync);
const setItem = jest.mocked(SecureStore.setItemAsync);
const deleteItem = jest.mocked(SecureStore.deleteItemAsync);

describe('auth session storage', () => {
  beforeEach(() => {
    getItem.mockReset().mockResolvedValue(null);
    setItem.mockReset().mockResolvedValue(undefined);
    deleteItem.mockReset().mockResolvedValue(undefined);
  });

  it('keeps the previous session readable when writing a replacement fails', async () => {
    const stored = new Map<string, string>();
    setItem.mockImplementation(async (key, value) => {
      if (value.startsWith('replacement')) throw new Error('secure store full');
      stored.set(key, value);
    });
    getItem.mockImplementation(async (key) => stored.get(key) ?? null);
    deleteItem.mockImplementation(async (key) => {
      stored.delete(key);
    });

    await authStorage.setItem('auth-session-test', 'previous-session');
    await expect(
      authStorage.setItem('auth-session-test', 'replacement-session'),
    ).rejects.toThrow('Unable to save the secure session');
    await expect(authStorage.getItem('auth-session-test')).resolves.toBe(
      'previous-session',
    );
  });

  it('serializes reads behind a failed write and writes SecureStore-safe keys', async () => {
    const stored = new Map<string, string>();
    let beganWrite = () => {};
    let rejectWrite = () => {};
    const writing = new Promise<void>((resolve) => {
      beganWrite = resolve;
    });
    const blocked = new Promise<void>((_, reject) => {
      rejectWrite = () => reject(new Error('secure store full'));
    });
    setItem.mockImplementation(async (key, value) => {
      expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
      if (value === 'replacement') {
        beganWrite();
        return blocked;
      }
      stored.set(key, value);
    });
    getItem.mockImplementation(async (key) => stored.get(key) ?? null);
    deleteItem.mockImplementation(async (key) => {
      stored.delete(key);
    });

    await authStorage.setItem('auth-serialized-test', 'previous');
    const replacement = authStorage.setItem(
      'auth-serialized-test',
      'replacement',
    );
    await writing;
    const read = authStorage.getItem('auth-serialized-test');
    rejectWrite();

    await expect(replacement).rejects.toThrow(
      'Unable to save the secure session',
    );
    await expect(read).resolves.toBe('previous');
  });

  it('round-trips multibyte text without splitting Unicode characters', async () => {
    const stored = new Map<string, string>();
    setItem.mockImplementation(async (key, value) => {
      stored.set(key, value);
    });
    getItem.mockImplementation(async (key) => stored.get(key) ?? null);
    deleteItem.mockImplementation(async (key) => {
      stored.delete(key);
    });
    const value = '🧡漢字é'.repeat(700);

    await authStorage.setItem('auth-unicode-test', value);

    await expect(authStorage.getItem('auth-unicode-test')).resolves.toBe(value);
  });

  it('surfaces secure-store read failures', async () => {
    getItem.mockRejectedValue(new Error('keychain unavailable'));
    await expect(authStorage.getItem('auth-session-test')).rejects.toThrow(
      'Unable to read the secure session manifest',
    );
  });
});

import { authStorage } from '../src/features/auth/storage';
import { pendingInvitationToken } from '../src/features/invitations/pending';

jest.mock('../src/features/auth/storage', () => ({
  authStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const getItem = jest.mocked(authStorage.getItem);
const setItem = jest.mocked(authStorage.setItem);
const removeItem = jest.mocked(authStorage.removeItem);
const token = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

describe('pending invitation token storage', () => {
  beforeEach(() => {
    getItem.mockReset().mockResolvedValue(null);
    setItem.mockReset().mockResolvedValue(undefined);
    removeItem.mockReset().mockResolvedValue(undefined);
  });

  it('stores and restores the token through the secure auth storage adapter', async () => {
    let saved: string | null = null;
    setItem.mockImplementation(async (_key, value) => {
      saved = value;
    });
    getItem.mockImplementation(async () => saved);

    await pendingInvitationToken.set(token);

    await expect(pendingInvitationToken.peek()).resolves.toBe(token);
    expect(setItem).toHaveBeenCalledWith(
      'panda-trainer-pending-invitation',
      token,
    );
  });

  it('clears the token after successful or terminal invite handling', async () => {
    await pendingInvitationToken.clear();

    expect(removeItem).toHaveBeenCalledWith('panda-trainer-pending-invitation');
  });

  it('rejects malformed input without writing it', async () => {
    await expect(pendingInvitationToken.set('not-a-token')).rejects.toThrow(
      'Invalid invitation token',
    );
    expect(setItem).not.toHaveBeenCalled();
  });

  it('discards malformed stored values before they can be replayed', async () => {
    getItem.mockResolvedValue('malformed-stored-value');

    await expect(pendingInvitationToken.peek()).resolves.toBeNull();
    expect(removeItem).toHaveBeenCalledWith('panda-trainer-pending-invitation');
  });

  it('serializes simultaneous writes and reads for the same pending token', async () => {
    let saved: string | null = null;
    setItem.mockImplementation(async (_key, value) => {
      saved = value;
    });
    getItem.mockImplementation(async () => saved);

    const setting = pendingInvitationToken.set(token);
    const reading = pendingInvitationToken.peek();

    await setting;
    await expect(reading).resolves.toBe(token);
  });

  it('does not let a stale route clear a newer pending invitation', async () => {
    let saved: string | null = null;
    setItem.mockImplementation(async (_key, value) => {
      saved = value;
    });
    getItem.mockImplementation(async () => saved);
    removeItem.mockImplementation(async () => {
      saved = null;
    });
    const newerToken = `${token.slice(0, -1)}A`;
    await pendingInvitationToken.set(token);
    await pendingInvitationToken.set(newerToken);

    await expect(pendingInvitationToken.clear(token)).resolves.toBe(false);
    await expect(pendingInvitationToken.peek()).resolves.toBe(newerToken);
    await expect(pendingInvitationToken.clear(newerToken)).resolves.toBe(true);
    await expect(pendingInvitationToken.peek()).resolves.toBeNull();
  });
});

it('does not clear on an identity change while the expected token is being read', async () => {
  let finish!: (value: string | null) => void;
  let current = true;
  getItem.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  removeItem.mockClear();
  const clearing = pendingInvitationToken.clear(token, async () => {
    if (!current) throw new Error('Session unavailable');
  });
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  current = false;
  finish(token);
  await expect(clearing).rejects.toThrow('Session unavailable');
  expect(removeItem).not.toHaveBeenCalled();
});

it('preserves a new pending intent queued while remove is awaiting storage', async () => {
  let saved: string | null = token;
  let finish!: () => void;
  getItem.mockImplementation(async () => saved);
  setItem.mockImplementation(async (_key, value) => {
    saved = value;
  });
  removeItem.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    saved = null;
  });
  const clearing = pendingInvitationToken.clear(token);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  const newerToken = `${token.slice(0, -1)}A`;
  const writing = pendingInvitationToken.set(newerToken);
  finish();
  await expect(clearing).resolves.toBe(false);
  await writing;
  expect(saved).toBe(newerToken);
});

it('failed storage does not poison the queue or allow a stale guarded write', async () => {
  setItem.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(pendingInvitationToken.set(token)).rejects.toThrow(
    'Storage unavailable',
  );
  await pendingInvitationToken.set(token);
  setItem.mockClear();
  await pendingInvitationToken.set(token, () => false);
  expect(setItem).not.toHaveBeenCalled();
});

it('a stale set cannot supersede a current queued set', async () => {
  let finish!: (value: string | null) => void;
  getItem.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const reading = pendingInvitationToken.peek();
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  setItem.mockClear();
  const newerToken = `${token.slice(0, -1)}A`;
  const current = pendingInvitationToken.set(newerToken);
  const stale = pendingInvitationToken.set(token, () => false);
  finish(null);
  await reading;
  await current;
  await stale;
  expect(setItem).toHaveBeenCalledTimes(1);
  expect(setItem).toHaveBeenCalledWith(
    'panda-trainer-pending-invitation',
    newerToken,
  );
});

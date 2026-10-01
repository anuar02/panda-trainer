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

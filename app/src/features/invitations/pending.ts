import { authStorage } from '@/features/auth/storage';

const pendingTokenKey = 'panda-trainer-pending-invitation';
const tokenAlphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
let operations = Promise.resolve();

const isInvitationToken = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value))
    return false;
  const lastValue = tokenAlphabet.indexOf(value.at(-1) ?? '');
  return lastValue >= 0 && lastValue % 4 === 0;
};

const serialize = async <T>(operation: () => Promise<T>): Promise<T> => {
  const previous = operations;
  let release = () => {};
  operations = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
};

export const pendingInvitationToken = {
  peek: () =>
    serialize(async () => {
      const token = await authStorage.getItem(pendingTokenKey);
      if (!token) return null;
      if (isInvitationToken(token)) return token;
      await authStorage.removeItem(pendingTokenKey);
      return null;
    }),
  set: (token: string) =>
    serialize(async () => {
      if (!isInvitationToken(token))
        throw new Error('Invalid invitation token');
      await authStorage.setItem(pendingTokenKey, token);
    }),
  clear: (expectedToken?: string) =>
    serialize(async () => {
      if (expectedToken !== undefined) {
        const current = await authStorage.getItem(pendingTokenKey);
        if (current !== expectedToken) return false;
      }
      await authStorage.removeItem(pendingTokenKey);
      return true;
    }),
};

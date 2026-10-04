import { authStorage } from '@/features/auth/storage';

const pendingTokenKey = 'panda-trainer-pending-invitation';
const tokenAlphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
let operations = Promise.resolve();
let generation = 0;

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
  generation: () => generation,
  peek: (
    guard: () => Promise<void> = async () => {},
    isCurrent: () => boolean = () => true,
  ) =>
    serialize(async () => {
      await guard();
      if (!isCurrent()) throw new Error('Invitation session unavailable');
      const expectedGeneration = generation;
      const token = await authStorage.getItem(pendingTokenKey);
      await guard();
      if (!isCurrent()) throw new Error('Invitation session unavailable');
      if (!token) return null;
      if (isInvitationToken(token)) return token;
      if (generation === expectedGeneration)
        await authStorage.removeItem(pendingTokenKey);
      await guard();
      return null;
    }),
  set: (token: string, isCurrent: () => boolean = () => true) => {
    if (!isCurrent()) return Promise.resolve();
    if (!isInvitationToken(token))
      return Promise.reject(new Error('Invalid invitation token'));
    const expectedGeneration = ++generation;
    return serialize(async () => {
      if (!isCurrent() || generation !== expectedGeneration) return;
      await authStorage.setItem(pendingTokenKey, token);
    });
  },
  clear: (
    expectedToken?: string,
    guard: () => Promise<void> = async () => {},
    isCurrent: () => boolean = () => true,
    expectedGeneration = generation,
  ) => {
    return serialize(async () => {
      await guard();
      if (!isCurrent() || generation !== expectedGeneration) return false;
      if (expectedToken !== undefined) {
        const current = await authStorage.getItem(pendingTokenKey);
        await guard();
        if (current === null)
          return isCurrent() && generation === expectedGeneration;
        if (
          current !== expectedToken ||
          !isCurrent() ||
          generation !== expectedGeneration
        )
          return false;
      }
      if (!isCurrent() || generation !== expectedGeneration) return false;
      await authStorage.removeItem(pendingTokenKey);
      await guard();
      return isCurrent() && generation === expectedGeneration;
    });
  },
};

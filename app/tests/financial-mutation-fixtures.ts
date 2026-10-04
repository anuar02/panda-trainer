import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/features/auth/client';
import { financialToken, financialSessionId } from './financial-read-fixtures';
export const financialId = (n: number) =>
  `51000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
export function mutationAuth(userId = financialId(1)) {
  let session: Session | null = {
    user: { id: userId },
    access_token: financialToken(userId),
  } as Session;
  const listeners = new Set<
    (event: AuthChangeEvent, session: Session | null) => void
  >();
  const getSession = jest.fn(async () => ({ data: { session }, error: null }));
  const unsubscribe = jest.fn();
  const auth = {
    getSession,
    onAuthStateChange: jest.fn(
      (listener: (event: AuthChangeEvent, session: Session | null) => void) => {
        listeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                listeners.delete(listener);
                unsubscribe();
              },
            },
          },
        };
      },
    ),
  };
  return {
    auth,
    getSession,
    unsubscribe,
    install: () =>
      jest
        .mocked(getSupabaseClient)
        .mockReturnValue({ auth } as unknown as NonNullable<
          ReturnType<typeof getSupabaseClient>
        >),
    emit: (event: AuthChangeEvent, next: Session | null) => {
      session = next;
      for (const listener of listeners) listener(event, next);
    },
    session: (actor = userId, identity = financialSessionId, version = 1) =>
      ({
        user: { id: actor },
        access_token: financialToken(actor, identity, version),
      }) as Session,
  };
}
export function mutationDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

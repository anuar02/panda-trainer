import type { AuthChangeEvent, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';
import type { ScheduleReadSession } from '../src/features/workspace-scheduling/read-session';

export const bookingAuthFixture = (userId: string) => {
  const sessionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const session = (
    actor = userId,
    login = sessionId,
    suffix = 'signature',
  ) => ({
    user: { id: actor },
    access_token: `header.${Buffer.from(JSON.stringify({ sub: actor, session_id: login })).toString('base64url')}.${suffix}`,
  });
  let current: ScheduleReadSession | null = session();
  const listeners = new Set<
    (event: AuthChangeEvent, value: ScheduleReadSession | null) => void
  >();
  const auth = {
    getSession: jest.fn(async () => ({
      data: { session: current },
      error: null,
    })),
    onAuthStateChange: jest.fn(
      (
        listener: (
          event: AuthChangeEvent,
          value: ScheduleReadSession | null,
        ) => void,
      ) => {
        listeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                listeners.delete(listener);
              },
            },
          },
        };
      },
    ),
  };
  return {
    auth,
    session,
    sessionId,
    client: { auth } as unknown as SupabaseClient<Database>,
    change(value: ScheduleReadSession | null, event?: AuthChangeEvent) {
      current = value;
      if (event) for (const listener of listeners) listener(event, value);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
};

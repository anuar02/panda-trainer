import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import { readSessionIdentity } from './read-auth';
import { TrainerBillingError } from './types';
import { uuid } from './validation';

export function financialMutationSessionIdentity(
  session: Pick<Session, 'access_token' | 'user'> | null,
): string | null {
  const parts = session?.access_token?.split('.');
  if (
    !parts ||
    parts.length !== 3 ||
    parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
  )
    return null;
  return readSessionIdentity(session);
}

type Client = NonNullable<ReturnType<typeof getSupabaseClient>>;
export type FinancialMutationFence = {
  guard: () => Promise<void>;
  assertCurrent: () => void;
  assertActor: (userId: string) => void;
  assertWorkspace: (workspaceId: string) => void;
  execute: <T>(
    run: (client: Client, token: string) => Promise<T>,
  ) => Promise<T>;
  dispose: () => void;
};
export function captureFinancialMutationFence(
  userId: string,
  workspaceId?: string,
  isActive: () => boolean = () => true,
): FinancialMutationFence {
  if (!uuid(userId) || (workspaceId !== undefined && !uuid(workspaceId)))
    throw new TrainerBillingError('invalidInput');
  const actor = userId.toLowerCase();
  const workspace = workspaceId?.toLowerCase();
  const client = getSupabaseClient();
  if (!client) throw new TrainerBillingError('configuration');
  let identity: string | null = null;
  let token = '';
  let cancelled = false;
  const assertCurrent = () => {
    if (cancelled || !isActive()) throw new TrainerBillingError('unavailable');
  };
  const { data } = client.auth.onAuthStateChange((event, session) => {
    const next = financialMutationSessionIdentity(session);
    if (
      event === 'SIGNED_OUT' ||
      (identity === null && event === 'SIGNED_IN') ||
      !next ||
      session?.user.id.toLowerCase() !== actor ||
      (identity !== null && next !== identity)
    )
      cancelled = true;
    else if (
      identity === null &&
      (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')
    )
      identity = next;
  });
  const guard = async () => {
    assertCurrent();
    let current: Awaited<ReturnType<Client['auth']['getSession']>>;
    try {
      current = await client.auth.getSession();
    } catch {
      assertCurrent();
      throw new TrainerBillingError('request');
    }
    assertCurrent();
    const next = financialMutationSessionIdentity(current.data.session);
    if (
      current.error ||
      !next ||
      current.data.session?.user.id.toLowerCase() !== actor ||
      (identity !== null && next !== identity)
    ) {
      cancelled = true;
      throw new TrainerBillingError('unavailable');
    }
    identity = next;
    token = current.data.session!.access_token;
  };
  return {
    guard,
    assertCurrent,
    assertActor: (value) => {
      assertCurrent();
      if (value.toLowerCase() !== actor)
        throw new TrainerBillingError('unavailable');
    },
    assertWorkspace: (value) => {
      assertCurrent();
      if (workspace !== undefined && value.toLowerCase() !== workspace)
        throw new TrainerBillingError('request');
    },
    execute: async (run) => {
      await guard();
      assertCurrent();
      let result;
      try {
        result = await run(client, token);
      } catch (error: unknown) {
        await guard();
        assertCurrent();
        throw error;
      }
      await guard();
      assertCurrent();
      return result;
    },
    dispose: () => {
      cancelled = true;
      token = '';
      data.subscription.unsubscribe();
    },
  };
}
export async function withFinancialMutationAuth<T>(
  userId: string,
  fence: FinancialMutationFence | undefined,
  run: (client: Client, token: string) => Promise<T>,
): Promise<T> {
  const current = fence ?? captureFinancialMutationFence(userId);
  try {
    current.assertActor(userId);
    return await current.execute(run);
  } finally {
    if (!fence) current.dispose();
  }
}

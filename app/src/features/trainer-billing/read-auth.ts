import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import { record, uuid } from './validation';

function decodePayload(part: string): unknown {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (!/^[A-Za-z0-9_-]+$/.test(part) || part.length % 4 === 1) return null;
  let bits = 0;
  let value = 0;
  let encoded = '';
  for (const character of part) {
    value = (value << 6) | alphabet.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      encoded += `%${((value >>> bits) & 255).toString(16).padStart(2, '0')}`;
      value &= (1 << bits) - 1;
    }
  }
  if (value !== 0) return null;
  return JSON.parse(decodeURIComponent(encoded)) as unknown;
}

export function readSessionIdentity(
  session: Pick<Session, 'access_token' | 'user'> | null,
): string | null {
  try {
    if (!session || !session.user || !uuid(session.user.id)) return null;
    const parts = session.access_token.split('.');
    const part = parts[1];
    if (parts.length !== 3 || !part) return null;
    const payload = decodePayload(part);
    if (
      !record(payload) ||
      !uuid(payload.session_id) ||
      payload.sub !== session.user.id
    )
      return null;
    return `${session.user.id.toLowerCase()}:${payload.session_id.toLowerCase()}`;
  } catch {
    return null;
  }
}

export async function withReadAuth<T>(
  expectedUserId: string,
  fail: (code: 'configuration' | 'unavailable') => never,
  run: (
    client: NonNullable<ReturnType<typeof getSupabaseClient>>,
    token: string,
    guard: () => Promise<void>,
  ) => Promise<T>,
): Promise<T> {
  const client = getSupabaseClient();
  if (!client) return fail('configuration');
  let identity: string | null = null;
  let changed = false;
  const { data: subscription } = client.auth.onAuthStateChange(
    (event, session) => {
      if (
        event === 'SIGNED_OUT' ||
        (identity === null && event === 'SIGNED_IN') ||
        (identity !== null && readSessionIdentity(session) !== identity)
      )
        changed = true;
    },
  );
  try {
    const before = await client.auth.getSession();
    identity = readSessionIdentity(before.data.session);
    if (
      before.error ||
      changed ||
      !identity ||
      before.data.session?.user.id.toLowerCase() !==
        expectedUserId.toLowerCase()
    )
      return fail('unavailable');
    const token = before.data.session!.access_token;
    const guard = async () => {
      if (changed) return fail('unavailable');
      const current = await client.auth.getSession();
      if (
        changed ||
        current.error ||
        readSessionIdentity(current.data.session) !== identity
      )
        return fail('unavailable');
    };
    const result = await run(client, token, guard);
    await guard();
    if (changed) return fail('unavailable');
    return result;
  } finally {
    changed = true;
    subscription.subscription.unsubscribe();
  }
}

export const financialPageSize = 500;
export const financialRowLimit = 10000;

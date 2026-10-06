import { createProgramReadFence } from '../client-program/program-read-session';
import { getSupabaseClient } from '@/features/auth/client';
import {
  ClientHistoryError,
  loadClientHistory,
  type ClientHistory,
} from '../client-history/service';

export type ClientProgressHistory = Omit<ClientHistory, 'nextOffset'> & {
  nextOffset: null;
};
export class ClientProgressError extends Error {
  constructor(
    readonly code: 'invalidInput' | 'configuration' | 'unavailable' | 'request',
  ) {
    super('Client progress could not be loaded');
    this.name = 'ClientProgressError';
  }
}
export async function loadClientProgressHistory(input: {
  expectedUserId: string;
  clientRecordId: string;
  workspaceId?: string;
  isCurrent?: () => boolean;
}): Promise<ClientProgressHistory> {
  const client = getSupabaseClient();
  if (!client) throw new ClientProgressError('configuration');
  const fence = await createProgramReadFence(
    client.auth,
    { userId: input.expectedUserId },
    input.isCurrent,
  ).catch(() => {
    throw new ClientProgressError('unavailable');
  });
  try {
    let offset = 0;
    let context: ClientHistory['context'] | null = null;
    const journals: ClientHistory['journals'] = [];
    const ids = new Set<string>();
    for (;;) {
      await fence.assertCurrent();
      const page = await loadClientHistory({ ...input, offset, limit: 100 });
      await fence.assertCurrent();
      if (
        page.context.clientRecordId !== input.clientRecordId.toLowerCase() ||
        (context !== null &&
          JSON.stringify(context) !== JSON.stringify(page.context)) ||
        page.journals.length > 100 ||
        (page.nextOffset !== null &&
          (!Number.isInteger(page.nextOffset) || page.nextOffset <= offset))
      )
        throw new ClientProgressError('request');
      context ??= page.context;
      for (const journal of page.journals) {
        if (ids.has(journal.id)) throw new ClientProgressError('request');
        ids.add(journal.id);
        journals.push(journal);
      }
      if (
        journals.length > 10000 ||
        (journals.length === 10000 && page.nextOffset !== null)
      )
        throw new ClientProgressError('request');
      if (page.nextOffset === null) break;
      if (offset >= 100000) throw new ClientProgressError('request');
      offset = page.nextOffset;
    }
    await fence.assertCurrent();
    return {
      context,
      journals: journals.sort(
        (a, b) =>
          Date.parse(b.finishedAtUtc) - Date.parse(a.finishedAtUtc) ||
          a.id.localeCompare(b.id),
      ),
      nextOffset: null,
    };
  } catch (error: unknown) {
    try {
      await fence.assertCurrent();
    } catch {
      throw new ClientProgressError('unavailable');
    }
    if (error instanceof ClientProgressError) throw error;
    if (error instanceof ClientHistoryError)
      throw new ClientProgressError(error.code);
    throw new ClientProgressError(
      error instanceof Error && error.name === 'ClientProgramSessionError'
        ? 'unavailable'
        : 'request',
    );
  } finally {
    fence.dispose();
  }
}

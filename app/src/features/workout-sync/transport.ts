import type { OutboxTransport } from '@/domain/workout-sync/types';
import { validateResponse } from '@/domain/workout-sync/validation';

export function createWorkoutSyncTransport(options: {
  url: string;
  anonKey: string;
  fetch?: typeof fetch;
}): OutboxTransport {
  const request = options.fetch ?? fetch;
  return {
    async apply(session, operations, signal) {
      if (
        !session.accessToken ||
        !session.sessionId ||
        operations.length < 1 ||
        operations.length > 100
      )
        throw new Error('invalid_request');
      const response = await request(
        `${options.url.replace(/\/$/, '')}/rest/v1/rpc/apply_operations`,
        {
          method: 'POST',
          headers: {
            apikey: options.anonKey,
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_workspace_id: session.workspaceId,
            p_operations: operations,
          }),
          signal,
        },
      );
      if (!response.ok) throw new Error('sync_request_failed');
      return validateResponse(await response.json(), session, operations);
    },
  };
}

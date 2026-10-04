import { createBookingSessionFence } from './creation-session';
import { WorkspaceSchedulingError } from './service';

export function createSchedulingCommandFence(
  userId: string,
  isCurrent: () => boolean = () => true,
) {
  return createBookingSessionFence(userId, isCurrent);
}
export function schedulingCommandError(error: unknown) {
  return error instanceof WorkspaceSchedulingError &&
    (error.code === 'configuration' || error.code === 'unavailable')
    ? error.code
    : 'request';
}
export type SchedulingCommandFence = ReturnType<
  typeof createSchedulingCommandFence
>;

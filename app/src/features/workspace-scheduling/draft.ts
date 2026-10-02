import type { SessionDraft } from '@/domain/scheduling';
import type { WorkspaceClient } from '@/features/workspace-clients/service';
import type { WorkspaceWorkoutTemplate } from '@/features/workspace-library/adapter';
import type { PendingWorkspaceBooking } from './pending';
import {
  resolveWorkspaceLocalTime,
  workspaceDateKey,
  workspaceMinuteOfDay,
} from './clock';

export type WorkspaceBookingDraftErrorCode =
  | 'invalidInput'
  | 'clients'
  | 'program'
  | 'ambiguous'
  | 'nonexistent'
  | 'past'
  | 'crossesMidnight';
export class WorkspaceBookingDraftError extends Error {
  constructor(readonly code: WorkspaceBookingDraftErrorCode) {
    super('Booking draft could not be converted');
    this.name = 'WorkspaceBookingDraftError';
  }
}
const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const durations = [45, 60, 75, 90];
export function buildWorkspaceBookingCommand({
  draft,
  clients,
  templates,
  timeZone,
  requestId,
  now,
}: {
  draft: SessionDraft;
  clients: readonly Pick<WorkspaceClient, 'id' | 'archived_at'>[];
  templates: readonly Pick<
    WorkspaceWorkoutTemplate,
    'id' | 'revision' | 'archivedAt' | 'exercises'
  >[];
  timeZone: string;
  requestId: string;
  now: Date;
}): PendingWorkspaceBooking {
  if (
    !uuid(requestId) ||
    !Number.isFinite(now.getTime()) ||
    !durations.includes(draft.duration) ||
    typeof draft.collisionAck !== 'boolean' ||
    typeof draft.programLater !== 'boolean'
  )
    throw new WorkspaceBookingDraftError('invalidInput');
  const selected = draft.clientIds.map((id) => id.toLowerCase()).sort();
  if (
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some(
      (id) =>
        !uuid(id) ||
        !clients.some(
          (client) =>
            client.id.toLowerCase() === id && client.archived_at === null,
        ),
    )
  )
    throw new WorkspaceBookingDraftError('clients');
  let plan: PendingWorkspaceBooking['plan'];
  if (!draft.programLater) {
    const template = templates.find(
      (item) =>
        item.id.toLowerCase() === draft.program?.toLowerCase() &&
        item.archivedAt === null,
    );
    if (
      !template ||
      !uuid(template.id) ||
      !Number.isInteger(template.revision) ||
      template.revision < 1 ||
      template.revision > 2147483647 ||
      !template.exercises.length ||
      template.exercises.some((line) => line.exercise.archivedAt !== null)
    )
      throw new WorkspaceBookingDraftError('program');
    plan = {
      templateId: template.id.toLowerCase(),
      expectedTemplateRevision: template.revision,
    };
  }
  let startsAtUtc: string;
  try {
    const resolved = resolveWorkspaceLocalTime(
      draft.date,
      draft.start,
      timeZone,
    );
    if (resolved.status !== 'unique')
      throw new WorkspaceBookingDraftError(resolved.status);
    startsAtUtc = resolved.startsAtUtc;
  } catch (error) {
    if (error instanceof WorkspaceBookingDraftError) throw error;
    throw new WorkspaceBookingDraftError('invalidInput');
  }
  const start = Date.parse(startsAtUtc);
  if (start <= now.getTime()) throw new WorkspaceBookingDraftError('past');
  const end = new Date(start + draft.duration * 60_000);
  const nextDate = new Date(`${draft.date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const endDate = workspaceDateKey(end, timeZone);
  if (
    endDate !== draft.date &&
    (endDate !== nextDate.toISOString().slice(0, 10) ||
      workspaceMinuteOfDay(end, timeZone) !== 0)
  )
    throw new WorkspaceBookingDraftError('crossesMidnight');
  return {
    clientRecordIds: selected,
    startsAtUtc,
    endsAtUtc: end.toISOString(),
    requestId: requestId.toLowerCase(),
    collisionAcknowledged: draft.collisionAck,
    ...(plan ? { plan } : {}),
  };
}

export function workspaceBookingWarningFingerprint(
  command: PendingWorkspaceBooking,
): string {
  return JSON.stringify([
    [...command.clientRecordIds].map((id) => id.toLowerCase()).sort(),
    command.startsAtUtc,
    command.endsAtUtc,
  ]);
}

export function restoreWorkspaceBookingDraft(
  command: PendingWorkspaceBooking,
  timeZone: string,
): SessionDraft {
  const start = new Date(command.startsAtUtc);
  const duration = (Date.parse(command.endsAtUtc) - start.getTime()) / 60_000;
  if (!durations.includes(duration))
    throw new WorkspaceBookingDraftError('invalidInput');
  const minute = workspaceMinuteOfDay(start, timeZone);
  return {
    clientIds: [...command.clientRecordIds],
    date: workspaceDateKey(start, timeZone),
    start: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
    duration,
    program: command.plan?.templateId ?? null,
    programLater: !command.plan,
    collisionAck: command.collisionAcknowledged,
  };
}

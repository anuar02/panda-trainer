import { workspaceAgendaSessions, type WorkspaceAgendaSession } from './agenda';
import { workspaceDateKey, workspaceMinuteOfDay } from './clock';
import { scheduleClock } from './screen-adapter';
import type { WorkspaceSchedule } from './service';

export type TrainerTodaySessionRow = {
  id: string;
  groupSessionId: string | null;
  name: string;
  participantNames: string[];
  programName: string | null;
  start: string;
  end: string;
  startsAtUtc: string;
  endsAtUtc: string;
  durationMinutes: number;
  role: 'now' | 'next' | null;
  past: boolean;
  cancelled: boolean;
  replies: WorkspaceAgendaSession['replies'];
  pendingProposalIds: string[];
};
export type TrainerTodayAgendaItem =
  | { kind: 'session'; row: TrainerTodaySessionRow }
  | {
      kind: 'gap';
      start: string;
      end: string;
      startsAtUtc: string;
      endsAtUtc: string;
      durationMinutes: number;
    }
  | {
      kind: 'overlap';
      startsAtUtc: string;
      endsAtUtc: string;
      durationMinutes: number;
    };
export type TrainerTodayAgenda = {
  date: string;
  clock: string;
  rows: TrainerTodaySessionRow[];
  pastRows: TrainerTodaySessionRow[];
  items: TrainerTodayAgendaItem[];
  pendingRequestCount: number;
  summary: {
    total: number;
    past: number;
    current: number;
    future: number;
    progressPercent: number;
  };
  endTime: string | null;
};

export function workspaceTodayAgenda(
  schedule: WorkspaceSchedule,
  now: Date,
  groupTitle: string,
): TrainerTodayAgenda {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp)) throw new RangeError('Invalid current date');
  const timezone = schedule.availability.timezone;
  const date = workspaceDateKey(now, timezone);
  const proposals = schedule.pendingProposals.filter(
    (proposal) =>
      proposal.authorRole === 'client' && proposal.status === 'pending',
  );
  const sessions = workspaceAgendaSessions(schedule).filter(
    (session) => session.date === date,
  );
  const live = sessions.filter(
    (session) => session.replies.confirmed + session.replies.pending > 0,
  );
  const current = live.filter(
    (session) =>
      Date.parse(session.startsAtUtc) <= timestamp &&
      Date.parse(session.endsAtUtc) > timestamp,
  );
  const next = current.length
    ? null
    : live.find((session) => Date.parse(session.startsAtUtc) > timestamp)?.id;
  const rows = sessions.map((session): TrainerTodaySessionRow => {
    const active = session.bookings.filter(
      (booking) =>
        booking.status === 'confirmed' || booking.status === 'proposed',
    );
    const cancelled = active.length === 0;
    const pendingProposalIds = cancelled
      ? []
      : proposals
          .filter((proposal) =>
            active.some((booking) => booking.id === proposal.booking_id),
          )
          .map((proposal) => proposal.id);
    const names = active.length
      ? active.map((booking) => booking.client_name)
      : session.bookings.map((booking) => booking.client_name);
    const programNames = active.map((booking) => booking.program_name ?? null);
    const programName = programNames[0] ?? null;
    return {
      id: session.id,
      groupSessionId: session.groupSessionId,
      name: session.groupSessionId ? groupTitle : (names[0] ?? ''),
      participantNames: names,
      programName: programNames.every((name) => name === programName)
        ? programName
        : null,
      start: scheduleClock(session.startMinute),
      end: scheduleClock(session.endMinute),
      startsAtUtc: session.startsAtUtc,
      endsAtUtc: session.endsAtUtc,
      durationMinutes:
        (Date.parse(session.endsAtUtc) - Date.parse(session.startsAtUtc)) /
        60_000,
      role: current.some((item) => item.id === session.id)
        ? 'now'
        : session.id === next
          ? 'next'
          : null,
      past:
        cancelled ||
        (Date.parse(session.endsAtUtc) <= timestamp &&
          !pendingProposalIds.length),
      cancelled,
      replies: { ...session.replies },
      pendingProposalIds,
    };
  });
  const clusters: TrainerTodaySessionRow[][] = [];
  for (const row of rows.filter((item) => !item.cancelled)) {
    const previous = clusters[clusters.length - 1];
    if (
      previous &&
      Date.parse(row.startsAtUtc) <
        Math.max(...previous.map((item) => Date.parse(item.endsAtUtc)))
    )
      previous.push(row);
    else clusters.push([row]);
  }
  clusters.push(...rows.filter((row) => row.cancelled).map((row) => [row]));
  clusters.sort(
    (a, b) =>
      Date.parse(a[0]?.startsAtUtc ?? '') - Date.parse(b[0]?.startsAtUtc ?? ''),
  );
  const pastClusters = clusters.filter((cluster) =>
    cluster.every((row) => row.past),
  );
  const pastRows = pastClusters.flat();
  const items: TrainerTodayAgendaItem[] = [];
  let cursor: number | null = pastClusters.length ? timestamp : null;
  for (const cluster of clusters.filter(
    (value) => !pastClusters.includes(value),
  )) {
    const start = Math.min(
      ...cluster.map((row) => Date.parse(row.startsAtUtc)),
    );
    const active = cluster.filter((row) => !row.cancelled);
    const end = active.length
      ? Math.max(...active.map((row) => Date.parse(row.endsAtUtc)))
      : start;
    if (cursor !== null && start > cursor)
      items.push({
        kind: 'gap',
        start: scheduleClock(workspaceMinuteOfDay(new Date(cursor), timezone)),
        end: cluster[0]?.start ?? '',
        startsAtUtc: new Date(cursor).toISOString(),
        endsAtUtc: new Date(start).toISOString(),
        durationMinutes: (start - cursor) / 60_000,
      });
    const overlapStart = Math.max(
      ...active.map((row) => Date.parse(row.startsAtUtc)),
    );
    const overlapEnd = Math.min(
      ...active.map((row) => Date.parse(row.endsAtUtc)),
    );
    cluster.forEach((row, index) => {
      if (index > 0 && overlapEnd > overlapStart) {
        items.push({
          kind: 'overlap',
          startsAtUtc: new Date(overlapStart).toISOString(),
          endsAtUtc: new Date(overlapEnd).toISOString(),
          durationMinutes: (overlapEnd - overlapStart) / 60_000,
        });
      }
      items.push({ kind: 'session', row });
    });
    if (active.length) cursor = cursor === null ? end : Math.max(cursor, end);
  }
  const past = live.filter(
    (session) => Date.parse(session.endsAtUtc) <= timestamp,
  ).length;
  const total = live.length;
  const latest = live.reduce<WorkspaceAgendaSession | null>(
    (value, session) =>
      !value || Date.parse(session.endsAtUtc) > Date.parse(value.endsAtUtc)
        ? session
        : value,
    null,
  );
  return {
    date,
    clock: scheduleClock(workspaceMinuteOfDay(now, timezone)),
    rows,
    pastRows,
    items,
    pendingRequestCount: proposals.length,
    summary: {
      total,
      past,
      current: current.length,
      future: total - past - current.length,
      progressPercent: total ? Math.round((past / total) * 100) : 0,
    },
    endTime: latest ? scheduleClock(latest.endMinute) : null,
  };
}

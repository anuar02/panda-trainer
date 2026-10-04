import {
  mergeNotifications,
  type NotificationCursor,
  type NotificationPage,
  type NotificationRow,
} from '@/domain/notifications';
export type NotificationState = {
  rows: NotificationRow[];
  unreadCount: number | null;
  cursor: NotificationCursor | null;
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  busy: boolean;
};
export type NotificationPort = {
  page(cursor: NotificationCursor | null): Promise<NotificationPage>;
  mark(id: string): Promise<NotificationRow>;
};
export function createNotificationController(
  port: NotificationPort,
  publish: (state: NotificationState) => void,
) {
  let live = true;
  let generation = 0;
  let mutation = 0;
  let state: NotificationState = {
    rows: [],
    unreadCount: null,
    cursor: null,
    hasMore: false,
    loading: true,
    failed: false,
    busy: false,
  };
  const emit = (next: Partial<NotificationState>) => {
    if (!live) return;
    state = { ...state, ...next };
    publish(state);
  };
  const load = async (append = false) => {
    if (!live || state.busy || (append && (state.loading || !state.hasMore)))
      return;
    const turn = ++generation;
    const readMutation = mutation;
    const cursor = append ? state.cursor : null;
    emit({ loading: true, failed: false });
    try {
      const page = await port.page(cursor);
      if (!live || turn !== generation || readMutation !== mutation) return;
      const last = page.rows.at(-1);
      emit({
        rows: mergeNotifications(state.rows, page.rows).filter(
          (row) => append || page.rows.some((next) => next.id === row.id),
        ),
        unreadCount: page.unread_count,
        cursor: last ? { at: last.created_at, id: last.id } : null,
        hasMore: page.has_more,
        loading: false,
        failed: false,
      });
    } catch {
      if (live && turn === generation && readMutation === mutation)
        emit({ loading: false, failed: true, unreadCount: null });
    }
  };
  return {
    load,
    async mark(id: string) {
      if (!live || state.busy) return false;
      ++mutation;
      ++generation;
      emit({ busy: true, loading: false, failed: false });
      try {
        const row = await port.mark(id);
        if (!live) return false;
        emit({ rows: mergeNotifications(state.rows, [row]), busy: false });
        await load();
        return live;
      } catch {
        if (live) emit({ busy: false, failed: true, unreadCount: null });
        return false;
      }
    },
    fail() {
      ++generation;
      emit({ loading: false, failed: true, unreadCount: null });
    },
    dispose() {
      live = false;
      ++generation;
    },
  };
}

import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ClientHistoryError,
  loadClientHistory,
  openClientHistorySession,
  type ClientHistorySession,
  type ClientHistory,
} from './service';

export type ClientHistoryScope = {
  userId: string;
  clientRecordId: string;
  workspaceId?: string;
  startsAtUtc?: string;
  endsAtUtc?: string;
  limit?: number;
};
type ErrorCode = ClientHistoryError['code'];
type Loaded = {
  key: string;
  history: ClientHistory | null;
  error: ErrorCode | null;
  moreError: ErrorCode | null;
  loadingMore: boolean;
};
type Control = {
  active: boolean;
  key: string;
  locked: boolean;
  session?: ClientHistorySession;
};
const errorCode = (error: unknown): ErrorCode =>
  error instanceof ClientHistoryError ? error.code : 'request';

export function useClientHistory({
  userId,
  clientRecordId,
  workspaceId,
  startsAtUtc,
  endsAtUtc,
  limit = 50,
}: ClientHistoryScope) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const control = useRef<Control | null>(null);
  const latest = useRef<Loaded | null>(null);
  const key = JSON.stringify([
    userId,
    clientRecordId,
    workspaceId,
    startsAtUtc,
    endsAtUtc,
    limit,
    attempt,
  ]);
  useFocusEffect(
    useCallback(() => {
      const token: Control = { active: true, key, locked: false };
      control.current = token;
      latest.current = null;
      setLoaded(null);
      const finish = (value: Loaded) => {
        if (
          !token.active ||
          (value.history !== null && !token.session?.valid()) ||
          control.current !== token
        )
          return;
        latest.current = value;
        setLoaded(value);
      };
      try {
        token.session = openClientHistorySession(userId, () => {
          token.active = false;
          latest.current = null;
          setLoaded(null);
          setAttempt((value) => value + 1);
        });
      } catch (error: unknown) {
        finish({
          key,
          history: null,
          error: errorCode(error),
          moreError: null,
          loadingMore: false,
        });
        return () => {
          token.active = false;
        };
      }
      void loadClientHistory({
        expectedUserId: userId,
        session: token.session,
        workspaceId,
        clientRecordId,
        startsAtUtc,
        endsAtUtc,
        limit,
        offset: 0,
      }).then(
        (history) =>
          finish({
            key,
            history,
            error: null,
            moreError: null,
            loadingMore: false,
          }),
        (error: unknown) =>
          finish({
            key,
            history: null,
            error: errorCode(error),
            moreError: null,
            loadingMore: false,
          }),
      );
      return () => {
        token.active = false;
        token.session?.dispose();
      };
    }, [
      key,
      userId,
      clientRecordId,
      workspaceId,
      startsAtUtc,
      endsAtUtc,
      limit,
    ]),
  );
  const loadMore = useCallback(async () => {
    const token = control.current;
    const current = latest.current;
    const history = current?.history;
    if (
      !token?.active ||
      !token.session?.valid() ||
      token.key !== key ||
      token.locked ||
      current?.key !== key ||
      !history ||
      history.nextOffset === null
    )
      return;
    token.locked = true;
    const update = (value: Loaded) => {
      if (!token.active || !token.session?.valid() || control.current !== token)
        return;
      latest.current = value;
      setLoaded(value);
    };
    update({ ...current, loadingMore: true, moreError: null });
    try {
      const page = await loadClientHistory({
        expectedUserId: userId,
        session: token.session,
        workspaceId,
        clientRecordId,
        startsAtUtc,
        endsAtUtc,
        limit,
        offset: history.nextOffset,
      });
      if (!token.active || !token.session?.valid() || control.current !== token)
        return;
      const ids = new Set(history.journals.map((journal) => journal.id));
      if (
        JSON.stringify(page.context) !== JSON.stringify(history.context) ||
        (page.nextOffset !== null && page.nextOffset <= history.nextOffset) ||
        page.journals.some((journal) => {
          if (ids.has(journal.id)) return true;
          ids.add(journal.id);
          return false;
        })
      )
        throw new ClientHistoryError('request');
      update({
        ...current,
        history: {
          context: history.context,
          nextOffset: page.nextOffset,
          journals: [...history.journals, ...page.journals].sort(
            (a, b) =>
              Date.parse(b.finishedAtUtc) - Date.parse(a.finishedAtUtc) ||
              a.id.localeCompare(b.id),
          ),
        },
        loadingMore: false,
        moreError: null,
      });
    } catch (error: unknown) {
      if (!token.active || control.current !== token) return;
      if (!token.session?.valid()) {
        latest.current = null;
        setLoaded({
          key,
          history: null,
          error: 'unavailable',
          moreError: null,
          loadingMore: false,
        });
      } else
        update({ ...current, loadingMore: false, moreError: errorCode(error) });
    } finally {
      token.locked = false;
    }
  }, [key, userId, clientRecordId, workspaceId, startsAtUtc, endsAtUtc, limit]);
  const current = loaded?.key === key ? loaded : null;
  return {
    generation: attempt,
    history: current?.history ?? null,
    loading: current === null,
    error: current?.error ?? null,
    loadingMore: current?.loadingMore ?? false,
    moreError: current?.moreError ?? null,
    hasMore: current?.history?.nextOffset != null,
    retry: useCallback(() => setAttempt((value) => value + 1), []),
    loadMore,
    retryMore: loadMore,
  };
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/features/auth/provider';
import { onboardingIdentity } from '@/features/onboarding/session';
import type { NotificationScope } from '@/domain/notifications';
import {
  createNotificationController,
  type NotificationState,
} from './controller';
import { notificationService } from './service';
import { watchNotifications } from './realtime';

export type NotificationContext = Omit<
  NotificationScope,
  'token' | 'signal' | 'isCurrent'
>;
const initial: NotificationState = {
  rows: [],
  unreadCount: null,
  cursor: null,
  hasMore: false,
  loading: true,
  failed: false,
  busy: false,
};
export function useNotifications(context: NotificationContext) {
  const auth = useAuth();
  const identity = onboardingIdentity(auth.session);
  const key = JSON.stringify([
    context.userId,
    context.workspaceId,
    context.clientRecordId,
    context.role,
    identity?.userId,
    identity?.sessionId,
    auth.loading,
    auth.failed,
  ]);
  const keyRef = useRef<string | null>(key);
  const tokenRef = useRef(auth.session?.access_token);
  useLayoutEffect(() => {
    tokenRef.current = auth.session?.access_token;
  }, [auth.session?.access_token]);
  const { userId, workspaceId, clientRecordId, role } = context;
  const callerValid = Boolean(
    identity && identity.userId === userId && !auth.loading && !auth.failed,
  );
  const controller = useRef<ReturnType<
    typeof createNotificationController
  > | null>(null);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    state: NotificationState;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useLayoutEffect(() => {
    keyRef.current = key;
    return () => {
      keyRef.current = null;
    };
  }, [key]);
  useEffect(() => {
    let live = true;
    const abort = new AbortController();
    const current = () =>
      live && keyRef.current === key && !abort.signal.aborted;
    const scope = (): NotificationScope => ({
      userId,
      workspaceId,
      clientRecordId,
      role,
      token: tokenRef.current ?? '',
      signal: abort.signal,
      isCurrent: current,
    });
    const next = createNotificationController(
      {
        page: (cursor) => notificationService.page(scope(), cursor),
        mark: (id) => notificationService.mark(scope(), id),
      },
      (state) => {
        if (current()) setSnapshot({ key, state });
      },
    );
    controller.current = next;
    let stop = () => {};
    if (!callerValid) next.fail();
    else {
      void next.load();
      stop = watchNotifications(
        scope(),
        () => void next.load(),
        () => next.fail(),
      );
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && current()) void next.load();
    });
    return () => {
      live = false;
      abort.abort();
      next.dispose();
      stop();
      subscription.remove();
      if (controller.current === next) controller.current = null;
    };
  }, [key, attempt, userId, workspaceId, clientRecordId, role, callerValid]);
  useFocusEffect(
    useCallback(() => {
      if (keyRef.current === key) void controller.current?.load();
    }, [key]),
  );
  const state = snapshot?.key === key ? snapshot.state : initial;
  return {
    scopeKey: key,
    ...state,
    retry: () => setAttempt((value) => value + 1),
    more: () => void controller.current?.load(true),
    mark: (id: string) =>
      controller.current?.mark(id) ?? Promise.resolve(false),
    async target(id: string) {
      const abort = new AbortController();
      const capturedKey = key;
      const current = () => keyRef.current === capturedKey;
      if (!current()) return null;
      const target = await notificationService.target(
        {
          ...context,
          token: tokenRef.current ?? '',
          signal: abort.signal,
          isCurrent: current,
        },
        id,
      );
      return current() ? target : null;
    },
  };
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/features/auth/provider';
import { authService } from '@/features/auth/service';
import { scheduleSessionId } from './read-session';
import { createScheduleReadController } from './read-controller';
import { paddedUtcWeekBounds } from './clock';
import { loadWorkspaceSchedule, type WorkspaceSchedule } from './service';

type LoadedSchedule = {
  key: string;
  schedule: WorkspaceSchedule | null;
  failed: boolean;
};

export function useWorkspaceSchedule(
  userId: string,
  workspaceId: string,
  dateKey: string,
) {
  const {
    session,
    loading: authLoading,
    failed: authFailed,
    configured,
  } = useAuth();
  const trusted = configured && !authLoading && !authFailed;
  const sessionId = scheduleSessionId(session);
  const [authGeneration, setAuthGeneration] = useState(0);
  const events = useRef(0);
  const [loaded, setLoaded] = useState<LoadedSchedule | null>(null);
  useEffect(() => {
    if (!configured) return;
    const subscription = authService.onAuthStateChange((event, next) => {
      if (
        event === 'INITIAL_SESSION' ||
        (event === 'TOKEN_REFRESHED' &&
          next?.user.id === userId &&
          scheduleSessionId(next) === sessionId &&
          sessionId !== null)
      )
        return;
      events.current += 1;
      setLoaded(null);
      setAuthGeneration(events.current);
    });
    return () => subscription.unsubscribe();
  }, [configured, userId, sessionId]);
  const { startsAtUtc, endsAtUtc } = paddedUtcWeekBounds(dateKey);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([
    userId,
    workspaceId,
    sessionId,
    authGeneration,
    trusted,
    startsAtUtc,
    endsAtUtc,
    attempt,
  ]);

  const currentKey = useRef(key);
  useLayoutEffect(() => {
    currentKey.current = key;
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      const eventGeneration = events.current;
      const controller = createScheduleReadController(
        async (isCurrent) => {
          if (!trusted || !sessionId || session?.user.id !== userId)
            throw new Error('Schedule session unavailable');
          return loadWorkspaceSchedule(workspaceId, startsAtUtc, endsAtUtc, {
            expectedUserId: userId,
            expectedSessionId: sessionId,
            assertCurrent: () => {
              if (!isCurrent()) throw new Error('Schedule read superseded');
            },
          });
        },
        (schedule, failed) =>
          setLoaded(
            schedule === null && !failed ? null : { key, schedule, failed },
          ),
        () => events.current === eventGeneration && currentKey.current === key,
      );
      void controller.run();
      return () => controller.stop();
    }, [
      key,
      userId,
      session?.user.id,
      sessionId,
      trusted,
      workspaceId,
      startsAtUtc,
      endsAtUtc,
      setLoaded,
    ]),
  );

  const current = loaded?.key === key ? loaded : null;
  return {
    schedule: current?.schedule ?? null,
    loading: current === null,
    failed: current?.failed ?? false,
    retry: useCallback(() => setAttempt((value) => value + 1), [setAttempt]),
  };
}

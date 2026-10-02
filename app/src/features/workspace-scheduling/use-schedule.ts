import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
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
  const { startsAtUtc, endsAtUtc } = paddedUtcWeekBounds(dateKey);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadedSchedule | null>(null);
  const key = JSON.stringify([
    userId,
    workspaceId,
    startsAtUtc,
    endsAtUtc,
    attempt,
  ]);

  useFocusEffect(
    useCallback(() => {
      setLoaded(null);
      let active = true;
      void loadWorkspaceSchedule(workspaceId, startsAtUtc, endsAtUtc).then(
        (schedule) => {
          if (active) setLoaded({ key, schedule, failed: false });
        },
        () => {
          if (active) setLoaded({ key, schedule: null, failed: true });
        },
      );
      return () => {
        active = false;
      };
    }, [key, workspaceId, startsAtUtc, endsAtUtc, setLoaded]),
  );

  const current = loaded?.key === key ? loaded : null;
  return {
    schedule: current?.schedule ?? null,
    loading: current === null,
    failed: current?.failed ?? false,
    retry: useCallback(() => setAttempt((value) => value + 1), [setAttempt]),
  };
}

import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { getWorkoutSession, workoutSessions } from '@/domain/workout';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
import { useWorkoutDemo } from '@/features/workout-demo';
import { WorkoutScreen } from '@/features/workout';

export function generateStaticParams() {
  return workoutSessions.map(({ id }) => ({ id }));
}

export default function SessionRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const sessionId = typeof id === 'string' ? id : '';
  const scenario = useDemoScenario();
  const { state, hydrated, readError, storageStatus, dispatch, retrySave } =
    useWorkoutDemo();
  useEffect(() => {
    if (hydrated && !readError && getWorkoutSession(sessionId))
      dispatch({ type: 'open', sessionId });
  }, [dispatch, hydrated, readError, sessionId]);
  const leave = () => router.replace('/(trainer)/schedule');
  return (
    <WorkoutScreen
      sessionId={sessionId}
      scenario={scenario}
      journal={state.sessions[sessionId] ?? null}
      dispatch={dispatch}
      hydrated={hydrated}
      readonly={readError}
      readError={readError}
      storageError={storageStatus === 'error'}
      saving={storageStatus === 'saving'}
      onRetrySave={retrySave}
      onMinimize={leave}
      onLeave={leave}
    />
  );
}

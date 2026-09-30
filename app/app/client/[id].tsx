import { currentSchedulingRequest } from '@/domain/scheduling';
import { routeClientId } from '@/features/scheduling-demo/route-params';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ClientDetailsScreen } from '@/features/client-details/client-details-screen';
import { demoClients } from '@/features/trainer-clients/demo';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
import { useWorkoutDemo } from '@/features/workout-demo';
import { useSchedulingDemo } from '@/features/scheduling-demo/provider';
import { SchedulingSessionSheet } from '@/features/scheduling-demo/session-sheet';

export function generateStaticParams() {
  return demoClients.map(({ id }) => ({ id }));
}
export default function ClientDetailsRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = routeClientId(params.id) ?? '';
  const scheduling = useSchedulingDemo();
  const workout = useWorkoutDemo();
  const scenario = useDemoScenario();
  const [sessionId, setSessionId] = useState<string | null>(null);
  return (
    <>
      <ClientDetailsScreen
        clientId={id}
        scenario={!scheduling.hydrated ? 'loading' : scenario}
        sessions={scheduling.state.sessions.map((session) => ({
          ...session,
          awaiting:
            currentSchedulingRequest(scheduling.state, session.id)?.awaiting ??
            null,
        }))}
        workoutState={workout.state}
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace('/(trainer)/clients')
        }
        onOpenSession={(sid) => setSessionId(sid)}
        onCreateSession={(clientId) =>
          router.push({ pathname: '/new', params: { clientId } })
        }
        onOpenLibrary={() => router.push('/(trainer)/library')}
      />
      <SchedulingSessionSheet
        sessionId={sessionId}
        onClose={() => setSessionId(null)}
      />
    </>
  );
}

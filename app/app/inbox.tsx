import { router } from 'expo-router';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
import { TrainerInboxScreen } from '@/features/trainer-inbox/trainer-inbox-screen';

export default function InboxRoute() {
  const scenario = useDemoScenario();
  return (
    <TrainerInboxScreen
      scenario={scenario}
      onBack={() =>
        router.canGoBack() ? router.back() : router.replace('/(trainer)/today')
      }
    />
  );
}

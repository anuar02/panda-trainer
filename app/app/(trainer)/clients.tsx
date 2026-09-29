import { TrainerClientsScreen } from '@/features/trainer-clients/trainer-clients-screen';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
export default function Screen() {
  return <TrainerClientsScreen scenario={useDemoScenario()} />;
}

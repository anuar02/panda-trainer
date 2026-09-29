import { ClientProgressScreen } from '@/features/client-progress/client-progress-screen';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';

export default function Route() {
  return <ClientProgressScreen scenario={useDemoScenario()} />;
}

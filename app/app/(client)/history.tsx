import { ClientHistoryScreen } from '@/features/client-history/client-history-screen';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
export default function Route() {
  return <ClientHistoryScreen scenario={useDemoScenario()} />;
}

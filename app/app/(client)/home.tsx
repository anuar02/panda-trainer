import { ClientHomeScreen } from '@/features/client-home/client-home-screen';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
export default function Screen() {
  return <ClientHomeScreen scenario={useDemoScenario()} />;
}

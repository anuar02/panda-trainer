import { ClientProgramScreen } from '@/features/client-program/client-program-screen';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
export default function Screen() {
  return <ClientProgramScreen scenario={useDemoScenario()} />;
}

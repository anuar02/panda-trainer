import { ClientProfileScreen } from '@/features/profiles/profile-screens';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
export default function Screen() {
  return <ClientProfileScreen scenario={useDemoScenario()} />;
}

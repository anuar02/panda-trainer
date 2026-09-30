import { TrainerProfileScreen } from '@/features/profiles/profile-screens';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
export default function Screen() {
  return <TrainerProfileScreen scenario={useDemoScenario()} />;
}

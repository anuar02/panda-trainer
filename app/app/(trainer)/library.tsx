import { useDemoScenario } from '@/features/demo/use-demo-scenario';
import { TrainerLibraryScreen } from '@/features/trainer-library/trainer-library-screen';
export default function Route() {
  return <TrainerLibraryScreen scenario={useDemoScenario()} />;
}

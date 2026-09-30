import { TrainerTodayScreen } from '@/features/trainer-today/trainer-today-screen';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
export default function Screen() {
  return <TrainerTodayScreen scenario={useDemoScenario()} />;
}

import { useDemoScenario } from '@/features/demo/use-demo-scenario';
import { TrainerScheduleScreen } from '@/features/trainer-schedule/trainer-schedule-screen';
export default function Route() {
  return <TrainerScheduleScreen scenario={useDemoScenario()} />;
}

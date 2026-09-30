import { routeDate } from '@/features/scheduling-demo/route-params';
import { useLocalSearchParams } from 'expo-router';
import { TrainerScheduleScreen } from '@/features/trainer-schedule/trainer-schedule-screen';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
export default function Screen() {
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const date = routeDate(params.date);
  return (
    <TrainerScheduleScreen
      key={date ?? 'today'}
      scenario={useDemoScenario()}
      initialDate={date}
    />
  );
}

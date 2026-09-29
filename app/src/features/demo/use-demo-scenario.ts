import { useLocalSearchParams } from 'expo-router';

export type DemoScenario = 'normal' | 'empty' | 'loading' | 'offline';

export function parseDemoScenario(
  value: string | string[] | undefined,
): DemoScenario {
  if (value === 'empty' || value === 'loading' || value === 'offline')
    return value;
  return 'normal';
}

export function useDemoScenario(): DemoScenario {
  const { scenario } = useLocalSearchParams<{ scenario?: string | string[] }>();
  return parseDemoScenario(scenario);
}

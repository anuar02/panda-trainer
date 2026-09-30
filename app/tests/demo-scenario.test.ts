import { parseDemoScenario } from '../src/features/demo/use-demo-scenario';

jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn() }));

test.each(['normal', 'empty', 'loading', 'offline'] as const)(
  'recognizes the %s demo scenario',
  (scenario) => expect(parseDemoScenario(scenario)).toBe(scenario),
);

test.each([undefined, '', 'error', ['offline', 'empty']])(
  'falls back to normal for unsupported or ambiguous input %p',
  (value) => expect(parseDemoScenario(value)).toBe('normal'),
);

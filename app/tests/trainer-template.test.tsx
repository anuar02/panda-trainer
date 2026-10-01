import { useState, type PropsWithChildren } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import { TemplateScreen } from '../src/features/trainer-library/template-screen';
import { SchedulingDemoProvider } from '../src/features/scheduling-demo/provider';
import { decodeSchedulingState } from '../src/domain/scheduling';
import { createWorkoutState, workoutReducer } from '../src/domain/workout';
import NewSessionRoute from '../app/new';
import TemplateRoute from '../app/template/[id]';

let mockParams: Record<string, string | string[]> = {};
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    canGoBack: () => false,
  },
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
beforeEach(() => {
  mockParams = {};
  mockPush.mockClear();
  mockReplace.mockClear();
});

test.each(['normal', 'empty', 'loading', 'offline'] as const)(
  'canonical template keeps its plan in %s',
  async (scenario) => {
    await render(
      <TemplateScreen
        id="t4"
        scenario={scenario}
        onBack={() => {}}
        onUse={() => {}}
      />,
    );
    expect(screen.getByText('Сила 5×5')).toBeTruthy();
    expect(screen.getByText('5 × 5 · 100 кг')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Изменить' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Создать копию шаблона' }),
    ).toBeDisabled();
    await fireEvent.press(screen.getByText('Жим лёжа'));
    expect(screen.getByText('Как выполнять')).toBeTruthy();
  },
);

test('template use stays disabled when the real workspace route has no scheduling action', async () => {
  await render(<TemplateScreen id="t4" onBack={() => {}} />);
  expect(
    screen.getByRole('button', { name: 'Создать занятие с этим планом' }),
  ).toBeDisabled();
});

test.each(['missing', 'constructor', undefined])(
  'invalid template %s cannot create a session',
  async (id) => {
    await render(<TemplateScreen id={id} onBack={() => {}} onUse={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Такой страницы нет');
    expect(
      screen.queryByRole('button', { name: 'Создать занятие с этим планом' }),
    ).toBeNull();
  },
);

test('template deep link normalizes repeated ids, routes selected plan and falls back to library', async () => {
  mockParams = { id: ['t2', 't4'] };
  await render(<TemplateRoute />);
  expect(screen.getByText('Верх Б')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Создать занятие с этим планом' }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/new',
    params: { templateId: 't2' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Назад' }));
  expect(mockReplace).toHaveBeenCalledWith('/(trainer)/library');
});

function Flow() {
  const [creating, setCreating] = useState(false);
  return creating ? (
    <NewSessionRoute />
  ) : (
    <TemplateScreen
      id="t4"
      onBack={() => {}}
      onUse={(templateId) => {
        mockParams = {
          templateId: [templateId, 't1'],
          clientId: 'c1',
          date: '2026-09-16',
          start: '18:00',
        };
        setCreating(true);
      }}
    />
  );
}

test('template to wizard persists selected program and creates the matching journal plan', async () => {
  let raw: string | null = null;
  const storage = {
    getItem: async () => raw,
    setItem: jest.fn(async (_key: string, value: string) => {
      raw = value;
    }),
  };
  await render(
    <SchedulingDemoProvider storage={storage}>
      <Flow />
    </SchedulingDemoProvider>,
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Создать занятие с этим планом' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeEnabled(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Продолжить' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Продолжить' }));
  expect(
    screen.getByRole('button', { name: /Сила 5×5/ }).props.accessibilityState
      .selected,
  ).toBe(true);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Создать занятие' }),
  );
  await waitFor(() => expect(storage.setItem).toHaveBeenCalled());
  const saved = decodeSchedulingState(raw!);
  expect(saved).not.toBeNull();
  const created = saved!.sessions.find((entry) =>
    entry.id.startsWith('session-'),
  )!;
  expect(created.program).toBe('Сила 5×5');
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/(trainer)/schedule',
    params: { date: '2026-09-16' },
  });
  const workout = workoutReducer(createWorkoutState(saved!.sessions), {
    type: 'open',
    sessionId: created.id,
  });
  expect(workout.sessions[created.id]?.plans.c1?.name).toBe('Сила 5×5');
  expect(workout.sessions[created.id]?.plans.c1?.exercises).toHaveLength(3);
});

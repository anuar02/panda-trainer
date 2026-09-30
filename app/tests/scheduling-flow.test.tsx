import { useState, type ComponentProps, type PropsWithChildren } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import {
  SchedulingDemoProvider,
  useSchedulingDemo,
} from '../src/features/scheduling-demo/provider';
import { TrainerScheduleScreen } from '../src/features/trainer-schedule/trainer-schedule-screen';
import { ClientDetailsScreen } from '../src/features/client-details/client-details-screen';
import { CreateSessionScreen } from '../src/features/session-editor';
import {
  applySchedulingAction,
  createSchedulingState,
  decodeSchedulingState,
  encodeSchedulingState,
} from '../src/domain/scheduling';
import { ClientHomeScreen } from '../src/features/client-home/client-home-screen';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ children, open }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

type Page = 'create' | 'schedule' | 'details' | 'home';
type Storage = NonNullable<
  ComponentProps<typeof SchedulingDemoProvider>['storage']
>;
function memoryStorage(initial: string | null = null) {
  let raw: string | null = initial;
  return {
    getItem: jest.fn(async () => raw),
    setItem: jest.fn(async (_key: string, value: string) => {
      raw = value;
    }),
    state: () => (raw ? decodeSchedulingState(raw) : null),
  };
}
function Flow({ page, date }: { page: Page; date: string }) {
  const demo = useSchedulingDemo();
  const [created, setCreated] = useState(false);
  if (!demo.hydrated) return null;
  if (page === 'home') return <ClientHomeScreen />;
  if (page === 'create' && !created)
    return (
      <CreateSessionScreen
        clients={[{ id: 'c1', name: 'Айгерим Бекова', initials: 'АБ' }]}
        templates={[]}
        dates={['2026-09-16']}
        today="2026-09-14"
        initialDate="2026-09-16"
        initialStart="11:00"
        initialClientId="c1"
        getCollisions={() => []}
        onClose={() => {}}
        onCreate={(draft) => {
          const result = demo.dispatch({
            type: 'create',
            id: 'flow-created',
            draft,
          });
          if (result.ok) {
            setCreated(true);
            return { ok: true };
          }
          return { ok: false, error: result.error };
        }}
      />
    );
  if (page === 'details' || created)
    return (
      <ClientDetailsScreen
        clientId="c1"
        sessions={demo.state.sessions}
        onBack={() => {}}
        onOpenSession={() => {}}
      />
    );
  return <TrainerScheduleScreen initialDate={date} />;
}
function App({
  storage,
  page,
  date = '2026-09-16',
}: {
  storage: Storage;
  page: Page;
  date?: string;
}) {
  return (
    <SchedulingDemoProvider storage={storage}>
      <Flow page={page} date={date} />
    </SchedulingDemoProvider>
  );
}

test('editor proposal reaches client card and calendar, survives provider remount without marking attendance', async () => {
  const storage = memoryStorage();
  const first = await render(<App storage={storage} page="create" />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeEnabled(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Продолжить' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Продолжить' }));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Назначить программу позже' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Создать занятие' }),
  );
  expect(screen.getByTestId('client-session-flow-created')).toBeTruthy();
  expect(screen.getByText('Ждём согласия')).toBeTruthy();
  expect(screen.getByText('7')).toBeTruthy();
  await waitFor(() =>
    expect(
      storage
        .state()
        ?.sessions.find((session) => session.id === 'flow-created'),
    ).toMatchObject({
      status: 'proposed',
      date: '2026-09-16',
      start: '11:00',
      program: null,
    }),
  );
  await first.unmount();
  storage.setItem.mockClear();
  const restored = await render(<App storage={storage} page="schedule" />);
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: 'Айгерим, 11:00–12:00. Открыть занятие',
      }),
    ).toBeTruthy(),
  );
  expect(storage.setItem).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Айгерим, 11:00–12:00. Открыть занятие',
    }),
  );
  expect(screen.getByRole('button', { name: 'Пришёл' })).toBeDisabled();
  expect(screen.getByText('Пока не отмечено')).toBeTruthy();
  await restored.rerender(<App storage={storage} page="home" />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить запись' }),
  );
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Отменить запись' })[1]!,
  );
  expect(screen.getByText('11:00–12:00')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Подтвердить' }));
  expect(screen.queryByRole('button', { name: 'Подтвердить' })).toBeNull();
  expect(screen.getByText('7')).toBeTruthy();
  await restored.rerender(<App storage={storage} page="schedule" />);
  expect(screen.queryByText('Ждём согласия клиента')).toBeNull();
  await waitFor(() =>
    expect(
      storage.state()?.sessions.find((session) => session.id === 'flow-created')
        ?.status,
    ).toBe('confirmed'),
  );
});

test('accepting a real calendar request moves the same session in calendar and client card after reload', async () => {
  const storage = memoryStorage();
  const view = await render(
    <App storage={storage} page="schedule" date="2026-09-17" />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: 'Айгерим, 18:00–19:00. Открыть занятие',
      }),
    ).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Айгерим, 18:00–19:00. Открыть занятие',
    }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Принять перенос' }),
  );
  expect(screen.getByText('День свободен')).toBeTruthy();
  await view.rerender(
    <App storage={storage} page="schedule" date="2026-09-18" />,
  );
  await fireEvent.press(screen.getByTestId('schedule-date-2026-09-18'));
  expect(
    screen.getByRole('button', {
      name: 'Айгерим, 19:00–20:00. Открыть занятие',
    }),
  ).toBeTruthy();
  await waitFor(() =>
    expect(storage.state()?.requests.r1?.state).toBe('accepted'),
  );
  expect(
    storage.state()?.sessions.filter((session) => session.id === 's8'),
  ).toHaveLength(1);
  await view.unmount();
  await render(<App storage={storage} page="details" />);
  await waitFor(() =>
    expect(screen.getByTestId('client-session-s8')).toHaveTextContent(
      /18 сен · 19:00–20:00/,
    ),
  );
  expect(screen.queryByText('17 сен · 18:00–19:00')).toBeNull();
  expect(screen.getByText('7')).toBeTruthy();
});

test('client accepts trainer counter from Home and only its own session changes', async () => {
  const initial = createSchedulingState();
  const counter = applySchedulingAction(
    initial,
    {
      type: 'counter',
      requestId: 'r1',
      expectedRevision: 0,
      to: { date: '2026-09-19', start: '12:00' },
    },
    { actor: { role: 'trainer' }, today: '2026-09-14', nowTime: '20:30' },
  );
  expect(counter.ok).toBe(true);
  if (!counter.ok) throw new Error(counter.error);
  const storage = memoryStorage(encodeSchedulingState(counter.state));
  const view = await render(<App storage={storage} page="home" />);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Ждёт вашего ответа' }),
    ).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Ждёт вашего ответа' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Принять перенос' }),
  );
  await waitFor(() =>
    expect(storage.state()?.requests.r1?.state).toBe('accepted'),
  );
  expect(storage.state()?.requests.r2).toEqual(initial.requests.r2);
  expect(
    storage.state()?.sessions.find((session) => session.id === 's9'),
  ).toEqual(initial.sessions.find((session) => session.id === 's9'));
  expect(screen.getByText('7')).toBeTruthy();
  await view.rerender(
    <App storage={storage} page="schedule" date="2026-09-19" />,
  );
  expect(
    screen.getByRole('button', {
      name: 'Айгерим, 12:00–13:00. Открыть занятие',
    }),
  ).toBeTruthy();
});

test('client withdraws its request and cancels its next session without touching other clients or charging a unit', async () => {
  const initial = createSchedulingState();
  const storage = memoryStorage();
  const view = await render(<App storage={storage} page="home" />);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Отозвать запрос' }),
    ).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отозвать запрос' }),
  );
  expect(screen.queryByRole('button', { name: 'Отозвать запрос' })).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить запись' }),
  );
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Отменить запись' })[1]!,
  );
  expect(screen.getByText('7')).toBeTruthy();
  await waitFor(() =>
    expect(
      storage.state()?.sessions.find((session) => session.id === 's7')?.status,
    ).toBe('cancelled'),
  );
  expect(storage.state()?.requests.r1?.state).toBe('withdrawn');
  expect(storage.state()?.requests.r2).toEqual(initial.requests.r2);
  expect(
    storage.state()?.sessions.find((session) => session.id === 's8'),
  ).toEqual(initial.sessions.find((session) => session.id === 's8'));
  await view.rerender(
    <App storage={storage} page="schedule" date="2026-09-14" />,
  );
  expect(
    screen.queryByRole('button', {
      name: 'Айгерим, 21:15–22:00. Открыть занятие',
    }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Арман, 18:30–19:30. Открыть занятие' }),
  ).toBeTruthy();
});

test('Home identifies groups, previews the client program and lists every remaining session with its own program', async () => {
  const initial = createSchedulingState();
  initial.sessions = initial.sessions.filter((session) => session.id !== 's7');
  initial.sessions.push(
    {
      id: 'group-next',
      revision: 0,
      date: '2026-09-15',
      start: '09:00',
      end: '10:00',
      kind: 'group',
      title: 'Общее занятие',
      clientId: null,
      program: 'Разные программы',
      status: 'confirmed',
      participants: [
        { clientId: 'c1', reply: 'confirmed', program: 'Full Body' },
        { clientId: 'c2', reply: 'confirmed', program: 'Сила 5×5' },
      ],
    },
    {
      id: 'personal-upper',
      revision: 0,
      date: '2026-09-16',
      start: '11:00',
      end: '12:00',
      kind: 'personal',
      title: 'Индивидуальная',
      clientId: 'c1',
      program: 'Верх Б',
      status: 'confirmed',
      participants: [{ clientId: 'c1', reply: 'confirmed' }],
    },
    {
      id: 'group-later',
      revision: 0,
      date: '2026-09-18',
      start: '10:00',
      end: '11:00',
      kind: 'group',
      title: 'Общее занятие',
      clientId: null,
      program: null,
      status: 'confirmed',
      participants: [
        { clientId: 'c1', reply: 'confirmed', program: null },
        { clientId: 'c2', reply: 'confirmed', program: 'Сила 5×5' },
      ],
    },
  );
  const storage = memoryStorage(encodeSchedulingState(initial));
  await render(<App storage={storage} page="home" />);
  await waitFor(() =>
    expect(screen.getByText('Занятие в мини-группе')).toBeTruthy(),
  );
  expect(screen.queryByText('Индивидуальная тренировка')).toBeNull();
  expect(
    screen.getByText(
      'Full Body · Приседания со штангой, Отжимания, Тяга в наклоне · ещё 1',
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/Сила 5×5/)).toBeNull();
  const personal = within(screen.getByTestId('home-upcoming-personal-upper'));
  expect(personal.getByText('16 сент · 11:00')).toBeTruthy();
  expect(
    personal.getByText(
      'Верх Б · Жим лёжа, Жим гантелей под углом, Тяга блока к поясу · ещё 1',
    ),
  ).toBeTruthy();
  expect(
    within(screen.getByTestId('home-upcoming-s8')).getByText(
      'Низ А · Приседания со штангой, Румынская тяга, Жим ногами · ещё 2',
    ),
  ).toBeTruthy();
  expect(
    within(screen.getByTestId('home-upcoming-group-later')).getByText(
      'Тренер подберёт упражнения на месте · Мини-группа',
    ),
  ).toBeTruthy();
  expect(screen.getAllByTestId(/^home-upcoming-/)).toHaveLength(3);
});

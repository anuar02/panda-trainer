import { acceptInvitation } from '../src/features/invitations/service';
import { ClientScheduleScreen } from '../src/features/client-scheduling/client-schedule-screen';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import { getSupabaseClient } from '../src/features/auth/client';
import { loadClientOverview } from '../src/features/client-home/overview-service';
import { loadClientHistory } from '../src/features/client-history/service';
import { loadClientProgressHistory } from '../src/features/client-progress/service';
import { loadClientSchedule } from '../src/features/client-scheduling/service';
import { useClientOverview } from '../src/features/client-home/use-overview';
import { useClientSchedule } from '../src/features/client-scheduling/use-schedule';
import { ClientHomeFacts } from '../src/features/client-home/client-home-facts';
import { ClientConnectedProgressScreen } from '../src/features/client-progress/client-connected-progress-screen';
import { ClientConnectedHistoryScreen } from '../src/features/client-history/client-connected-history-screen';
import {
  clientNetwork,
  user,
  card,
  workspace,
  scope,
  props,
} from './som36-client-network';
import { clientReadToken } from './client-read-auth-fixture';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const react = jest.requireActual<typeof import('react')>('react');
    react.useEffect(callback, [callback]);
  },
}));
jest.mock('../src/features/workspace-scheduling/use-clock', () => ({
  useWorkspaceClock: () => new Date('2026-10-04T12:00:00Z'),
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
jest.mock('../src/features/workout-demo', () => ({
  useOptionalWorkoutDemo: () => null,
}));
jest.mock('../src/features/scheduling-demo/provider', () => ({
  useOptionalSchedulingDemo: () => null,
}));
let api: ReturnType<typeof clientNetwork>;
beforeEach(() => {
  api = clientNetwork();
  jest.mocked(getSupabaseClient).mockReturnValue(api.client);
});
const readInput = {
  expectedUserId: user,
  workspaceId: workspace,
  clientRecordId: card,
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test('invitation linkage exposes pre-registration finished actual sets and shared notes through real adapters', async () => {
  api.setLinked(false);
  await expect(loadClientHistory(readInput)).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect(
    await acceptInvitation(`${'a'.repeat(42)}A`, {
      userId: user,
      token: api.session().access_token,
    }),
  ).toMatchObject({ clientRecordId: card });
  const history = await loadClientProgressHistory(readInput);
  expect(history.journals[0]?.startedAtUtc).toBe('2020-01-01T10:00:00.000Z');
  expect(history.journals[0]?.notes[0]?.text).toBe(
    'Shared pre-registration note',
  );
  expect(
    history.journals[0]?.exercises[0]?.sets.map((set) => [
      set.weightG,
      set.reps,
    ]),
  ).toEqual([
    [50501, 8],
    [0, 0],
    [null, null],
  ]);
  expect(api.listenerCount()).toBe(0);
});
test('Home facts presents exact aggregate money and real weight+reps with no invented demo', async () => {
  await render(
    <ClientHomeFacts
      {...props}
      timezone="UTC"
      now={new Date('2026-10-04T12:00:00Z')}
      onOpenProgress={jest.fn()}
    />,
  );
  await waitFor(() => expect(screen.getByText('Synthetic squat')).toBeTruthy());
  expect(screen.getByText('50,501 кг × 8 повт')).toBeTruthy();
  expect(screen.getByText('6')).toBeTruthy();
  expect(screen.getByText(/90.*071.*992.*547.*409,93/)).toBeTruthy();
  expect(screen.queryByText('Айгерим')).toBeNull();
  expect(
    api.calls.filter((c) => c.table === 'get_my_client_overview'),
  ).toHaveLength(1);
});
test('Progress selects a period and exercise actual history including null/zero, refresh applies explicit correction readback', async () => {
  const view = await render(<ClientConnectedProgressScreen {...props} />);
  await waitFor(() =>
    expect(screen.getByText('50,501 кг × 8 повт')).toBeTruthy(),
  );
  expect(screen.getByLabelText('1 окт.: посещений 1')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'История упражнения: Synthetic squat' }),
  );
  expect(screen.getByText('0 кг')).toBeTruthy();
  expect(screen.getByText('Повторы не записаны')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Предыдущая неделя' }),
  );
  await waitFor(() =>
    expect(
      screen.getByText(
        'На этой неделе пока нет отметок о посещении. Отмена и неявка не учитываются.',
      ),
    ).toBeTruthy(),
  );
  api.tables.set_results![0]!.weight_g = 60001;
  api.tables.workout_instances![0]!.revision = 2;
  await act(async () =>
    api.emit('TOKEN_REFRESHED', {
      ...api.session(),
      access_token: clientReadToken(user, undefined, 'refresh'),
    }),
  );
  await waitFor(() =>
    expect(screen.getByText('60,001 кг × 8 повт')).toBeTruthy(),
  );
  expect(screen.queryByText('Повторы не записаны')).toBeNull();
  await view.unmount();
  expect(api.listenerCount()).toBe(0);
});
test('history screen opens pre-link detail and preserves missing quantities', async () => {
  await render(<ClientConnectedHistoryScreen {...props} />);
  await waitFor(() =>
    expect(screen.getByText(/Shared pre-registration note/)).toBeTruthy(),
  );
  await fireEvent.press(screen.getByRole('button', { name: /1 янв.*10:00/ }));
  expect(screen.getByText('Synthetic squat')).toBeTruthy();
  expect(screen.getByText('Вес не записан')).toBeTruthy();
});
test.each([
  'workout_instances',
  'workout_exercises',
  'set_results',
  'session_notes',
])(
  'privacy: foreign/unknown %s response fails closed despite filters',
  async (table) => {
    api.intercept(async (name) => {
      if (name === table) {
        const row = api.tables[table]?.[0];
        if (row) row.private_data = 'hidden';
      }
    });
    await expect(loadClientHistory(readInput)).rejects.toMatchObject({
      code: 'request',
    });
  },
);
test.each([
  { due_minor: 9007199254740993 },
  { due_minor: '-1' },
  { private_notes: [] },
  { context: { ...scope, workspace_id: user } },
  { remaining_units: '9' },
])(
  'overview rejects wrong precision/scope/unknown fields %j',
  async (change) => {
    api.setOverview({ ...api.overview(), ...change });
    await expect(loadClientOverview(scope)).rejects.toMatchObject({
      code: 'request',
    });
  },
);
test('empty linked account retains exact zero totals and empty visits', async () => {
  api.setOverview({
    ...api.overview(),
    remaining_units: '0',
    active_units: '0',
    due_minor: '0',
    visits: [],
  });
  expect(await loadClientOverview(scope)).toMatchObject({
    remainingUnits: '0',
    dueMinor: '0',
    visits: [],
  });
});
test.each(['success', 'error'])(
  'late %s after same-user relogin cannot publish or dispatch next page',
  async (outcome) => {
    const gate = deferred();
    let first = true;
    api.intercept(async (table) => {
      if (table === 'bookings' && first) {
        first = false;
        await gate.promise;
        if (outcome === 'error') throw new Error('network');
      }
    });
    const read = loadClientSchedule(readInput);
    await waitFor(() =>
      expect(api.calls.some((c) => c.table === 'bookings')).toBe(true),
    );
    api.emit('SIGNED_IN', {
      ...api.session(),
      access_token: clientReadToken(
        user,
        'f1360000-0000-4000-8000-000000000099',
      ),
    });
    gate.resolve();
    await expect(read).rejects.toMatchObject({ code: 'unavailable' });
    expect(api.calls.some((c) => c.table === 'booking_programs')).toBe(false);
  },
);
test('overview hook refresh/card change/unmount owns both successful and error responses', async () => {
  const hook = await renderHook(useClientOverview, { initialProps: scope });
  await waitFor(() =>
    expect(hook.result.current.data?.remainingUnits).toBe('6'),
  );
  const gate = deferred();
  api.intercept(async (table) => {
    if (table === 'get_my_client_overview') await gate.promise;
  });
  await act(async () => hook.result.current.retry());
  expect(hook.result.current.data).toBeNull();
  await hook.rerender({ ...scope, workspaceId: user });
  expect(hook.result.current.data).toBeNull();
  await hook.unmount();
  gate.resolve();
  await act(async () => {});
  expect(api.listenerCount()).toBe(0);
});
test('schedule hook refresh hides cache immediately and rejects late completion after unmount', async () => {
  const hook = await renderHook(useClientSchedule, {
    initialProps: {
      userId: user,
      workspaceId: workspace,
      clientRecordId: card,
    },
  });
  await waitFor(() =>
    expect(hook.result.current.schedule?.bookings).toHaveLength(1),
  );
  const gate = deferred();
  api.intercept(async (table) => {
    if (table === 'get_my_client_schedule_context') await gate.promise;
  });
  await act(async () => hook.result.current.retry());
  expect(hook.result.current.schedule).toBeNull();
  await hook.unmount();
  gate.resolve();
  await act(async () => {});
  expect(api.listenerCount()).toBe(0);
});

test('authenticated Home uses the real schedule, commands coordinator and facts adapters', async () => {
  const view = await render(<ClientScheduleScreen {...props} />);
  await waitFor(() =>
    expect(screen.getByText('50,501 кг × 8 повт')).toBeTruthy(),
  );
  expect(screen.getByText('Ближайшее занятие')).toBeTruthy();
  expect(screen.getByText('Тренер подберёт упражнения на месте')).toBeTruthy();
  expect(screen.getByText('Привет, Synthetic client')).toBeTruthy();
  await view.unmount();
  expect(api.listenerCount()).toBe(0);
});
test('real history pagination reads 101 journals under one unchanged caller session', async () => {
  const original = api.tables.workout_instances![0]!;
  api.tables.workout_instances = Array.from({ length: 101 }, (_, index) => ({
    ...original,
    id: `f1360000-0000-4000-8000-${String(1000 + index).padStart(12, '0')}`,
  }));
  const history = await loadClientProgressHistory(readInput);
  expect(history.journals).toHaveLength(101);
  expect(
    api.calls
      .filter((call) => call.table === 'workout_instances')
      .map((call) => call.offset),
  ).toEqual([0, 100]);
  expect(new Set(api.calls.map((call) => call.header)).size).toBe(1);
});
test('exercise without a ranked recorded result keeps null/zero history available', async () => {
  api.tables.set_results!.forEach((set) => {
    set.weight_g = null;
    set.reps = null;
  });
  await render(<ClientConnectedProgressScreen {...props} />);
  await waitFor(() =>
    expect(screen.getByText('Первые результаты — впереди')).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'История упражнения: Synthetic squat' }),
  );
  expect(screen.getAllByText('Вес не записан')).toHaveLength(3);
  expect(screen.getAllByText('Повторы не записаны')).toHaveLength(3);
  expect(screen.queryByText('0 кг')).toBeNull();
});
test('malformed JWT cannot dispatch client overview', async () => {
  api.emit('SIGNED_IN', { ...api.session(), access_token: 'invalid' });
  await expect(loadClientOverview(scope)).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect(api.calls).toEqual([]);
});

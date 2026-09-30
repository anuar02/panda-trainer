import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  WorkoutDemoProvider,
  useWorkoutDemo,
} from '../src/features/workout-demo/provider';
import { createSchedulingState } from '../src/domain/scheduling';
import type { WorkoutSession } from '../src/domain/workout';

test('waits for scheduling hydration, persists dynamic journal, synchronizes changes and reports finished sessions', async () => {
  let catalog: readonly WorkoutSession[] = [
    ...createSchedulingState().sessions,
    {
      id: 'new',
      date: '2026-09-16',
      start: '18:00',
      end: '19:00',
      kind: 'personal',
      clientId: 'c6',
      title: 'Тимур Ахметов',
      program: 'Верх Б',
      status: 'confirmed',
      participants: [{ clientId: 'c6', reply: 'confirmed', program: 'Верх Б' }],
    },
  ];
  let catalogReady = false;
  let raw: string | null = null;
  const storage = {
    getItem: jest.fn(async () => raw),
    setItem: jest.fn(async (_key: string, value: string) => {
      raw = value;
    }),
  };
  const finished = jest.fn();
  const wrapper = ({ children }: PropsWithChildren) => (
    <WorkoutDemoProvider
      storage={storage}
      catalog={catalog}
      catalogReady={catalogReady}
      onFinishedSessionIds={finished}
    >
      {children}
    </WorkoutDemoProvider>
  );
  const first = await renderHook(useWorkoutDemo, { wrapper });
  expect(first.result.current.hydrated).toBe(false);
  expect(storage.getItem).not.toHaveBeenCalled();
  catalogReady = true;
  await first.rerender({});
  await waitFor(() => expect(first.result.current.hydrated).toBe(true));
  await act(() => {
    expect(
      first.result.current.dispatch({ type: 'open', sessionId: 'new' }),
    ).toBe(true);
    expect(
      first.result.current.dispatch({
        type: 'save',
        clientId: 'c6',
        exerciseId: 'e1',
        setIndex: 0,
        value: { kg: 20, reps: 8 },
      }),
    ).toBe(true);
  });
  await waitFor(() => expect(first.result.current.storageStatus).toBe('saved'));
  catalog = catalog.map((session) =>
    session.id === 'new' ? { ...session, date: '2026-09-17' } : session,
  );
  await first.rerender({});
  await waitFor(() =>
    expect(
      first.result.current.state.catalog?.find(
        (session) => session.id === 'new',
      )?.date,
    ).toBe('2026-09-17'),
  );
  await waitFor(() => expect(first.result.current.storageStatus).toBe('saved'));
  await first.unmount();
  const restored = await renderHook(useWorkoutDemo, { wrapper });
  await waitFor(() => expect(restored.result.current.hydrated).toBe(true));
  expect(
    restored.result.current.state.sessions.new?.values.c6?.e1?.[0]?.kg,
  ).toBe(20);
  await act(() => {
    restored.result.current.dispatch({ type: 'finish' });
    restored.result.current.dispatch({ type: 'confirmPartial' });
  });
  expect(finished).toHaveBeenLastCalledWith(['new']);
});

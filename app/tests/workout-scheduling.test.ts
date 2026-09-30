import {
  applySchedulingAction,
  createSchedulingState,
  createSessionDraft,
} from '../src/domain/scheduling';
import {
  createWorkoutState,
  decodeWorkoutState,
  getWorkoutSession,
  syncWorkoutCatalog,
  workoutClientHistory,
  workoutEligible,
  workoutReducer,
  workoutSessions,
} from '../src/domain/workout';
import type { SchedulingState } from '../src/domain/scheduling';

function created(): SchedulingState {
  const result = applySchedulingAction(
    createSchedulingState(),
    {
      type: 'create',
      id: 'new',
      draft: createSessionDraft({
        clientIds: ['c6'],
        date: '2026-09-16',
        start: '18:00',
        program: 'Верх Б',
      }),
    },
    { actor: { role: 'trainer' }, today: '2026-09-14', nowTime: '20:30' },
  );
  if (!result.ok) throw new Error(result.error);
  const confirmed = applySchedulingAction(
    result.state,
    { type: 'confirm', sessionId: 'new', expectedSessionRevision: 0 },
    {
      actor: { role: 'client', clientId: 'c6' },
      today: '2026-09-14',
      nowTime: '20:30',
    },
  );
  if (!confirmed.ok) throw new Error(confirmed.error);
  return confirmed.state;
}

test('created and confirmed session opens its selected program, records sets and survives decoding', () => {
  const schedule = created();
  let state = workoutReducer(createWorkoutState(schedule.sessions), {
    type: 'open',
    sessionId: 'new',
  });
  expect(state.sessions.new?.plans.c6?.name).toBe('Верх Б');
  state = workoutReducer(state, {
    type: 'save',
    clientId: 'c6',
    exerciseId: 'e1',
    setIndex: 0,
    value: { kg: 20, reps: 8 },
  });
  expect(state.sessions.new?.values.c6?.e1?.[0]).toEqual({ kg: 20, reps: 8 });
  expect(decodeWorkoutState(JSON.stringify(state), schedule.sessions)).toEqual(
    state,
  );
  expect(workoutSessions.some((session) => session.id === 'new')).toBe(false);
});

test('schedule changes update current time and cancellation blocks writes without deleting recorded values', () => {
  const schedule = created();
  let state = workoutReducer(createWorkoutState(schedule.sessions), {
    type: 'open',
    sessionId: 'new',
  });
  state = workoutReducer(state, {
    type: 'save',
    clientId: 'c6',
    exerciseId: 'e1',
    setIndex: 0,
    value: { kg: 20, reps: 8 },
  });
  const moved = schedule.sessions.map((session) =>
    session.id === 'new'
      ? { ...session, date: '2026-09-17', start: '19:00', end: '20:00' }
      : session,
  );
  state = syncWorkoutCatalog(state, moved);
  expect(getWorkoutSession('new', state.catalog)?.start).toBe('19:00');
  state = syncWorkoutCatalog(
    state,
    moved.map((session) =>
      session.id === 'new' ? { ...session, status: 'cancelled' } : session,
    ),
  );
  expect(workoutEligible(state.sessions.new!, 'c6')).toBe(false);
  expect(
    workoutReducer(state, {
      type: 'save',
      clientId: 'c6',
      exerciseId: 'e1',
      setIndex: 0,
      value: { kg: 99, reps: 8 },
    }),
  ).toBe(state);
  expect(state.sessions.new?.values.c6?.e1?.[0]?.kg).toBe(20);
  expect(decodeWorkoutState(JSON.stringify(state))).not.toBeNull();
});

test('finished historical results retain session date and membership after catalog changes', () => {
  const schedule = created();
  let state = workoutReducer(createWorkoutState(schedule.sessions), {
    type: 'open',
    sessionId: 'new',
  });
  state = workoutReducer(state, {
    type: 'save',
    clientId: 'c6',
    exerciseId: 'e1',
    setIndex: 0,
    value: { kg: 20, reps: 8 },
  });
  state = workoutReducer(workoutReducer(state, { type: 'finish' }), {
    type: 'confirmPartial',
  });
  state = syncWorkoutCatalog(state, []);
  expect(workoutClientHistory(state, 'c6')[0]).toMatchObject({
    sessionId: 'new',
    date: '2026-09-16',
  });
  expect(
    decodeWorkoutState(JSON.stringify(state), [])?.sessions.new?.finished,
  ).toBe(true);
  const corrupted = {
    ...state,
    catalog: state.catalog?.map((session) => ({
      ...session,
      date: '2026-02-30',
    })),
  };
  expect(decodeWorkoutState(JSON.stringify(corrupted), [])).toBeNull();
});

test('group creation uses selected program for every participant and live cancellation is isolated', () => {
  const schedule = created();
  const catalog = schedule.sessions.map((session) =>
    session.id === 'new'
      ? {
          ...session,
          kind: 'group' as const,
          clientId: null,
          participants: [
            { clientId: 'c1', reply: 'confirmed' as const, program: 'Верх Б' },
            { clientId: 'c6', reply: 'confirmed' as const, program: 'Верх Б' },
          ],
        }
      : session,
  );
  let state = workoutReducer(createWorkoutState(catalog), {
    type: 'open',
    sessionId: 'new',
  });
  expect(state.sessions.new?.plans.c1?.name).toBe('Верх Б');
  state = syncWorkoutCatalog(
    state,
    catalog.map((session) =>
      session.id === 'new'
        ? {
            ...session,
            participants: session.participants.map((participant) =>
              participant.clientId === 'c1'
                ? { ...participant, reply: 'cancelled' as const }
                : participant,
            ),
          }
        : session,
    ),
  );
  expect(workoutEligible(state.sessions.new!, 'c1')).toBe(false);
  expect(workoutEligible(state.sessions.new!, 'c6')).toBe(true);
});

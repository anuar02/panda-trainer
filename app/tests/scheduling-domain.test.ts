import {
  applySchedulingAction,
  createSchedulingState,
  createSessionDraft,
  decodeSchedulingState,
  encodeSchedulingState,
  patchSessionDraft,
  schedulingCollisions,
} from '../src/domain/scheduling';
import type {
  SchedulingAction,
  SchedulingContext,
  SchedulingState,
} from '../src/domain/scheduling';

const trainer: SchedulingContext = {
  actor: { role: 'trainer' },
  today: '2026-09-14',
  nowTime: '20:30',
};
const client = (clientId = 'c1'): SchedulingContext => ({
  ...trainer,
  actor: { role: 'client', clientId },
});
const draft = () =>
  createSessionDraft({
    clientIds: ['c1'],
    date: '2026-09-16',
    start: '18:00',
    program: 'Низ А',
  });
const apply = (
  state: SchedulingState,
  action: SchedulingAction,
  context = trainer,
) => {
  const result = applySchedulingAction(state, action, context);
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

test('seeds match sessions and pending requests without moving agreed times', () => {
  const state = createSchedulingState();
  expect(state.sessions.map((session) => session.id)).toEqual([
    's1',
    's2',
    's3',
    's4',
    's5',
    's6',
    's7',
    's8',
    's9',
  ]);
  expect(state.sessions.find((session) => session.id === 's8')?.date).toBe(
    '2026-09-17',
  );
  expect(state.requests.r1!.to.date).toBe('2026-09-18');
  state.sessions[0]!.participants[0]!.reply = 'cancelled';
  expect(createSchedulingState().sessions[0]!.participants[0]!.reply).toBe(
    'confirmed',
  );
});

test('new client without a program can receive a proposal and its pending move survives confirmation', () => {
  let state = apply(createSchedulingState(), {
    type: 'create',
    id: 'new',
    draft: { ...draft(), clientIds: ['c6'], programLater: true },
  });
  expect(state.sessions.at(-1)?.title).toBe('Тимур Ахметов');
  state = apply(state, {
    type: 'propose',
    id: 'request',
    sessionId: 'new',
    expectedSessionRevision: 0,
    to: { date: '2026-09-19', start: '19:00' },
  });
  state = apply(
    state,
    { type: 'confirm', sessionId: 'new', expectedSessionRevision: 0 },
    client('c6'),
  );
  expect(decodeSchedulingState(encodeSchedulingState(state))).toEqual(state);
  expect(state.requests.request).toMatchObject({
    revision: 1,
    sessionRevision: 1,
    state: 'pending',
  });
});

test('cancellation closes personal requests and only removes the caller from a group', () => {
  const initial = createSchedulingState();
  const personal = apply(
    initial,
    { type: 'cancel', sessionId: 's8', expectedSessionRevision: 0 },
    client(),
  );
  expect(personal.sessions.find((session) => session.id === 's8')?.status).toBe(
    'cancelled',
  );
  expect(personal.requests.r1).toMatchObject({
    state: 'withdrawn',
    awaiting: null,
  });
  expect(decodeSchedulingState(encodeSchedulingState(personal))).toEqual(
    personal,
  );
  expect(
    applySchedulingAction(
      initial,
      { type: 'cancel', sessionId: 's6', expectedSessionRevision: 0 },
      client(),
    ),
  ).toMatchObject({ error: 'forbidden' });
  const group = apply(
    initial,
    { type: 'cancel', sessionId: 's6', expectedSessionRevision: 0 },
    client('c5'),
  );
  expect(group.sessions[5]).toMatchObject({
    status: 'confirmed',
    participants: [
      { clientId: 'c3', reply: 'confirmed' },
      { clientId: 'c4', reply: 'cancelled' },
      { clientId: 'c5', reply: 'cancelled' },
    ],
  });
});

test('creation proposes time and each group member confirms independently', () => {
  let state = apply(createSchedulingState(), {
    type: 'create',
    id: 'new',
    draft: { ...draft(), clientIds: ['c1', 'c2'], programLater: true },
  });
  expect(state.sessions.at(-1)).toMatchObject({
    status: 'proposed',
    kind: 'group',
    program: null,
    participants: [
      { clientId: 'c1', reply: 'pending', program: null },
      { clientId: 'c2', reply: 'pending', program: null },
    ],
  });
  expect(
    applySchedulingAction(
      state,
      { type: 'confirm', sessionId: 'new', expectedSessionRevision: 0 },
      trainer,
    ),
  ).toMatchObject({ ok: false, error: 'forbidden' });
  state = apply(
    state,
    { type: 'confirm', sessionId: 'new', expectedSessionRevision: 0 },
    client(),
  );
  expect(state.sessions.at(-1)?.status).toBe('proposed');
  expect(
    applySchedulingAction(
      state,
      { type: 'confirm', sessionId: 'new', expectedSessionRevision: 0 },
      client('c2'),
    ),
  ).toMatchObject({ ok: false, error: 'stale' });
  state = apply(
    state,
    { type: 'confirm', sessionId: 'new', expectedSessionRevision: 1 },
    client('c2'),
  );
  expect(state.sessions.at(-1)?.status).toBe('confirmed');
});

test.each([
  [{ clientIds: [] }, 'clients'],
  [{ clientIds: ['c1', 'c1'] }, 'clients'],
  [{ clientIds: ['missing'] }, 'clients'],
  [{ date: '2026-02-30' }, 'future'],
  [{ date: '2026-09-14', start: '20:30' }, 'future'],
  [{ start: '25:00' }, 'future'],
  [{ duration: 0 }, 'duration'],
  [{ duration: 1.5 }, 'duration'],
  [{ start: '23:30' }, 'duration'],
  [{ program: null }, 'program'],
] as const)('rejects invalid creation %j', (patch, error) => {
  expect(
    applySchedulingAction(
      createSchedulingState(),
      {
        type: 'create',
        id: 'new',
        draft: {
          ...draft(),
          ...patch,
          clientIds:
            'clientIds' in patch ? [...patch.clientIds] : draft().clientIds,
        },
      },
      trainer,
    ),
  ).toEqual({ ok: false, error });
});

test('overlap needs explicit acknowledgement and changing time revokes it', () => {
  const state = createSchedulingState();
  const overlapping = { ...draft(), date: '2026-09-17', start: '18:30' };
  expect(
    schedulingCollisions(state, overlapping).map((session) => session.id),
  ).toEqual(['s8']);
  expect(
    schedulingCollisions(state, { ...overlapping, start: '19:00' }),
  ).toEqual([]);
  expect(
    applySchedulingAction(
      state,
      { type: 'create', id: 'new', draft: overlapping },
      trainer,
    ),
  ).toEqual({ ok: false, error: 'overlap' });
  const accepted = { ...overlapping, collisionAck: true };
  expect(
    apply(state, { type: 'create', id: 'new', draft: accepted }).sessions.at(-1)
      ?.status,
  ).toBe('proposed');
  expect(patchSessionDraft(accepted, { start: '18:45' }).collisionAck).toBe(
    false,
  );
  expect(
    patchSessionDraft(accepted, { programLater: true }).program,
  ).toBeNull();
});

test('counter preserves current time; only recipient acceptance changes it once', () => {
  const initial = createSchedulingState();
  const state = apply(initial, {
    type: 'counter',
    requestId: 'r1',
    expectedRevision: 0,
    to: { date: '2026-09-19', start: '12:00' },
  });
  expect(state.sessions).toEqual(initial.sessions);
  expect(state.requests.r1).toMatchObject({
    revision: 1,
    state: 'counter',
    author: 'trainer',
    awaiting: 'client',
  });
  expect(
    applySchedulingAction(
      state,
      { type: 'accept', requestId: 'r1', expectedRevision: 0 },
      client(),
    ),
  ).toEqual({ ok: false, error: 'stale' });
  expect(
    applySchedulingAction(
      state,
      { type: 'accept', requestId: 'r1', expectedRevision: 1 },
      trainer,
    ),
  ).toEqual({ ok: false, error: 'forbidden' });
  expect(
    applySchedulingAction(
      state,
      { type: 'accept', requestId: 'r1', expectedRevision: 1 },
      client('c2'),
    ),
  ).toEqual({ ok: false, error: 'forbidden' });
  const accepted = apply(
    state,
    { type: 'accept', requestId: 'r1', expectedRevision: 1 },
    client(),
  );
  expect(
    accepted.sessions.find((session) => session.id === 's8'),
  ).toMatchObject({
    date: '2026-09-19',
    start: '12:00',
    end: '13:00',
    revision: 1,
  });
  expect(
    applySchedulingAction(
      accepted,
      { type: 'accept', requestId: 'r1', expectedRevision: 1 },
      client(),
    ).ok,
  ).toBe(false);
});

test.each(['decline', 'withdraw'] as const)(
  '%s preserves agreed time and closes request',
  (type) => {
    const initial = createSchedulingState();
    const state = apply(
      initial,
      { type, requestId: 'r1', expectedRevision: 0 },
      type === 'withdraw' ? client() : trainer,
    );
    expect(state.sessions).toEqual(initial.sessions);
    expect(state.requests.r1!.awaiting).toBeNull();
  },
);

test('proposal blocks duplicate, foreign participant, group and finished sessions', () => {
  const state = createSchedulingState();
  const proposal: SchedulingAction = {
    type: 'propose',
    id: 'new',
    sessionId: 's7',
    expectedSessionRevision: 0,
    to: { date: '2026-09-16', start: '22:00' },
  };
  const next = apply(state, proposal);
  expect(next.requests.new!.to.end).toBe('22:45');
  expect(next.sessions).toEqual(state.sessions);
  expect(applySchedulingAction(next, proposal, trainer)).toMatchObject({
    error: 'duplicate',
  });
  expect(applySchedulingAction(state, proposal, client('c2'))).toMatchObject({
    error: 'forbidden',
  });
  expect(
    applySchedulingAction(state, { ...proposal, sessionId: 's6' }, trainer),
  ).toMatchObject({ error: 'group' });
  expect(
    applySchedulingAction(state, proposal, {
      ...trainer,
      finishedSessionIds: ['s7'],
    }),
  ).toMatchObject({ error: 'unavailable' });
});

test('accept revalidates future target and original session revision', () => {
  const state = createSchedulingState();
  expect(
    applySchedulingAction(
      state,
      { type: 'accept', requestId: 'r1', expectedRevision: 0 },
      { ...trainer, today: '2026-09-20' },
    ),
  ).toMatchObject({ error: 'target' });
  state.sessions[7]!.revision++;
  expect(
    applySchedulingAction(
      state,
      { type: 'accept', requestId: 'r1', expectedRevision: 0 },
      trainer,
    ),
  ).toMatchObject({ error: 'stale' });
});

test('storage roundtrips and rejects malformed dates, unknown clients and request references', () => {
  const state = createSchedulingState();
  expect(decodeSchedulingState(encodeSchedulingState(state))).toEqual(state);
  expect(decodeSchedulingState('invalid')).toBeNull();
  expect(decodeSchedulingState('{"version":2,"state":{}}')).toBeNull();
  for (const mutate of [
    (value: SchedulingState) => {
      value.sessions[0]!.date = '2026-02-30';
    },
    (value: SchedulingState) => {
      value.sessions[0]!.end = '29:00';
    },
    (value: SchedulingState) => {
      value.sessions[0]!.participants[0]!.clientId = 'unknown';
    },
    (value: SchedulingState) => {
      value.requests.r1!.sessionId = 'missing';
    },
    (value: SchedulingState) => {
      value.requests.r1!.awaiting = 'client';
    },
    (value: SchedulingState) => {
      value.requests.r1!.sessionRevision = 8;
    },
  ]) {
    const value = createSchedulingState();
    mutate(value);
    expect(decodeSchedulingState(encodeSchedulingState(value))).toBeNull();
  }
});

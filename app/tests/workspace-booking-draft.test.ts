import type { SessionDraft } from '@/domain/scheduling';
import {
  buildWorkspaceBookingCommand,
  restoreWorkspaceBookingDraft,
  workspaceBookingWarningFingerprint,
} from '@/features/workspace-scheduling/draft';
const clientId = '71000000-0000-4000-8000-000000000001';
const templateId = '91000000-0000-4000-8000-000000000001';
const requestId = 'a1000000-0000-4000-8000-000000000001';
const draft: SessionDraft = {
  clientIds: [clientId],
  date: '2026-10-05',
  start: '15:00',
  duration: 60,
  program: null,
  programLater: true,
  collisionAck: false,
};
const input = {
  draft,
  clients: [{ id: clientId, archived_at: null }],
  templates: [],
  timeZone: 'Asia/Almaty',
  requestId,
  now: new Date('2026-10-01T00:00:00Z'),
};
test('creates UTC command and restores local draft without changing participants', () => {
  const command = buildWorkspaceBookingCommand(input);
  expect(command).toEqual({
    clientRecordIds: [clientId],
    startsAtUtc: '2026-10-05T10:00:00.000Z',
    endsAtUtc: '2026-10-05T11:00:00.000Z',
    collisionAcknowledged: false,
    requestId,
  });
  expect(restoreWorkspaceBookingDraft(command, input.timeZone)).toEqual(draft);
});
test.each([45, 60, 75, 90])('uses elapsed duration %i', (duration) => {
  const command = buildWorkspaceBookingCommand({
    ...input,
    draft: { ...draft, duration },
  });
  expect(Date.parse(command.endsAtUtc) - Date.parse(command.startsAtUtc)).toBe(
    duration * 60_000,
  );
});
test.each([
  [{ ...draft, clientIds: [] }, 'clients'],
  [{ ...draft, clientIds: [clientId, clientId.toUpperCase()] }, 'clients'],
  [{ ...draft, clientIds: [templateId] }, 'clients'],
  [{ ...draft, duration: 30 }, 'invalidInput'],
  [{ ...draft, date: '2026-02-30' }, 'invalidInput'],
  [{ ...draft, start: '25:00' }, 'invalidInput'],
  [{ ...draft, date: '2026-09-30' }, 'past'],
  [{ ...draft, programLater: false, program: templateId }, 'program'],
] as const)('rejects invalid draft %j', (value, code) => {
  try {
    buildWorkspaceBookingCommand({
      ...input,
      draft: { ...value, clientIds: [...value.clientIds] },
    });
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
});
test('rejects archived participant', () => {
  expect(() =>
    buildWorkspaceBookingCommand({
      ...input,
      clients: [{ id: clientId, archived_at: '2026-10-01' }],
    }),
  ).toThrow(expect.objectContaining({ code: 'clients' }));
});
test.each([
  ['2026-03-08', '02:30', 'nonexistent'],
  ['2026-11-01', '01:30', 'ambiguous'],
])('rejects DST %s %s', (date, start, code) => {
  expect(() =>
    buildWorkspaceBookingCommand({
      ...input,
      draft: { ...draft, date, start },
      timeZone: 'America/New_York',
      now: new Date('2026-01-01'),
    }),
  ).toThrow(expect.objectContaining({ code }));
});
test('accepts exact next midnight and rejects later end', () => {
  const command = buildWorkspaceBookingCommand({
    ...input,
    draft: { ...draft, start: '23:00' },
  });
  expect(command.endsAtUtc).toBe('2026-10-05T19:00:00.000Z');
  expect(() =>
    buildWorkspaceBookingCommand({
      ...input,
      draft: { ...draft, start: '23:15' },
    }),
  ).toThrow(expect.objectContaining({ code: 'crossesMidnight' }));
});
test('fingerprint remains stable across acknowledgement and plan changes but changes for time or clients', () => {
  const command = buildWorkspaceBookingCommand(input);
  const original = workspaceBookingWarningFingerprint(command);
  expect(
    workspaceBookingWarningFingerprint({
      ...command,
      collisionAcknowledged: true,
      requestId: templateId,
      plan: { templateId, expectedTemplateRevision: 2 },
    }),
  ).toBe(original);
  expect(
    workspaceBookingWarningFingerprint({
      ...command,
      endsAtUtc: '2026-10-05T12:00:00.000Z',
    }),
  ).not.toBe(original);
  expect(
    workspaceBookingWarningFingerprint({
      ...command,
      clientRecordIds: [templateId],
    }),
  ).not.toBe(original);
});

test('captures active template revision and rejects unavailable plans', () => {
  const template = {
    id: templateId,
    revision: 3,
    archivedAt: null,
    exercises: [
      {
        id: clientId,
        name: 'Присед',
        sets: 3,
        reps: '10',
        target: 0,
        rest: 90,
        unit: 'повт' as const,
        lineId: requestId,
        lineRevision: 1,
        position: 0,
        note: null,
        plannedWeightG: null,
        exercise: {
          id: clientId,
          name: 'Присед',
          group: 'Ноги',
          equipment: 'Штанга',
          aliases: [],
          instructions: [],
          sourceKey: null,
          archivedAt: null,
          revision: 1,
          measure: 'reps' as const,
          bodyweight: false,
        },
      },
    ],
  };
  const selected = {
    ...input,
    draft: { ...draft, program: templateId, programLater: false },
    templates: [template],
  };
  const command = buildWorkspaceBookingCommand(selected);
  expect(command.plan).toEqual({ templateId, expectedTemplateRevision: 3 });
  expect(restoreWorkspaceBookingDraft(command, input.timeZone)).toEqual(
    selected.draft,
  );
  for (const invalid of [
    { ...template, archivedAt: '2026-10-01' },
    { ...template, revision: 0 },
    { ...template, exercises: [] },
    {
      ...template,
      exercises: template.exercises.map((line) => ({
        ...line,
        exercise: { ...line.exercise, archivedAt: '2026-10-01' },
      })),
    },
  ]) {
    expect(() =>
      buildWorkspaceBookingCommand({ ...selected, templates: [invalid] }),
    ).toThrow(expect.objectContaining({ code: 'program' }));
  }
  expect(
    buildWorkspaceBookingCommand({
      ...selected,
      draft: { ...selected.draft, programLater: true },
    }).plan,
  ).toBeUndefined();
});

test('duration follows elapsed minutes through DST spring transition', () => {
  const command = buildWorkspaceBookingCommand({
    ...input,
    timeZone: 'America/New_York',
    now: new Date('2026-01-01'),
    draft: { ...draft, date: '2026-03-08', start: '01:30' },
  });
  expect(command.startsAtUtc).toBe('2026-03-08T06:30:00.000Z');
  expect(command.endsAtUtc).toBe('2026-03-08T07:30:00.000Z');
});

test('requires start strictly after now', () => {
  expect(() =>
    buildWorkspaceBookingCommand({
      ...input,
      now: new Date('2026-10-05T10:00:00Z'),
    }),
  ).toThrow(expect.objectContaining({ code: 'past' }));
});

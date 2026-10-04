import type { WorkoutPreloadContext } from '@/domain/workout-preload/types';
import { withPreparedWorkoutJournals } from '@/features/workout-preload/prepare';
import { session } from './workout-sync-fixtures';
const context = (status: 'not_created' | 'in_progress') =>
  ({
    participants: [1, 2, 3].map((id) => ({
      bookingId: `booking-${id}`,
      workoutId: `workout-${id}`,
      workoutStatus: status,
    })),
  }) as unknown as WorkoutPreloadContext;
it('prepares each participant through RPC then adopts persisted identities via refresh', async () => {
  const load = jest
    .fn()
    .mockResolvedValueOnce(context('not_created'))
    .mockResolvedValueOnce(context('in_progress'));
  const request = jest.fn(async () => ({ ok: true }) as Response);
  const reader = withPreparedWorkoutJournals(
    { load },
    {
      url: 'https://example.invalid',
      anonKey: 'key',
      fetch: request as unknown as typeof fetch,
      newId: () => 'request',
    },
  );
  const result = await reader.load(
    session,
    'booking-1',
    new AbortController().signal,
  );
  expect(
    result.participants.every((p) => p.workoutStatus === 'in_progress'),
  ).toBe(true);
  expect(load).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenCalledTimes(3);
  request.mock.calls.forEach((call, index) => {
    const args = call as unknown as [string, RequestInit];
    expect(args[0]).toContain('/rpc/prepare_workout_journal');
    expect(JSON.parse(args[1].body as string)).toEqual({
      p_booking_id: `booking-${index + 1}`,
      p_workout_id: `workout-${index + 1}`,
      p_request_id: 'request',
    });
  });
});
it('does not write existing journals and never publishes an unprepared offline participant', async () => {
  const request = jest.fn(async () => {
    throw new Error('offline');
  });
  const ready = withPreparedWorkoutJournals(
    { load: jest.fn(async () => context('in_progress')) },
    { fetch: request },
  );
  await ready.load(session, 'booking-1', new AbortController().signal);
  expect(request).not.toHaveBeenCalled();
  const unavailable = withPreparedWorkoutJournals(
    { load: jest.fn(async () => context('not_created')) },
    {
      url: 'https://example.invalid',
      anonKey: 'key',
      fetch: request,
      newId: () => 'request',
    },
  );
  await expect(
    unavailable.load(session, 'booking-1', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'network' });
});
it('stops further participant preparations when the session aborts during a response', async () => {
  const controller = new AbortController();
  const request = jest.fn(async () => {
    controller.abort();
    return { ok: true } as Response;
  });
  const reader = withPreparedWorkoutJournals(
    { load: jest.fn(async () => context('not_created')) },
    {
      url: 'https://example.invalid',
      anonKey: 'key',
      fetch: request as unknown as typeof fetch,
      newId: () => 'request',
    },
  );
  await expect(
    reader.load(session, 'booking-1', controller.signal),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(request).toHaveBeenCalledTimes(1);
});

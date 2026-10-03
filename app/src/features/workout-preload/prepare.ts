import { randomUUID } from 'expo-crypto';
import type { WorkoutPreloadReader } from '@/domain/workout-preload/types';
import { WorkoutPreloadReadError } from './service';

export function withPreparedWorkoutJournals(
  reader: WorkoutPreloadReader,
  options: {
    url?: string;
    anonKey?: string;
    fetch?: typeof fetch;
    newId?: () => string;
  } = {},
): WorkoutPreloadReader {
  return {
    async load(session, bookingId, signal) {
      const context = await reader.load(session, bookingId, signal);
      const missing = context.participants.filter(
        (participant) => participant.workoutStatus === 'not_created',
      );
      if (!missing.length) return context;
      const url = options.url ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
      const key = options.anonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new WorkoutPreloadReadError('configuration');
      for (const participant of missing) {
        if (signal.aborted) throw new WorkoutPreloadReadError('unavailable');
        let response: Response;
        try {
          response = await (options.fetch ?? fetch)(
            `${url.replace(/\/$/, '')}/rest/v1/rpc/prepare_workout_journal`,
            {
              method: 'POST',
              headers: {
                apikey: key,
                Authorization: `Bearer ${session.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                p_booking_id: participant.bookingId,
                p_workout_id: participant.workoutId,
                p_request_id: (options.newId ?? randomUUID)(),
              }),
              signal,
            },
          );
        } catch {
          throw new WorkoutPreloadReadError('network');
        }
        if (signal.aborted) throw new WorkoutPreloadReadError('unavailable');
        if (!response.ok)
          throw new WorkoutPreloadReadError(
            response.status >= 500 || response.status === 429
              ? 'network'
              : 'unavailable',
          );
      }
      return reader.load(session, bookingId, signal);
    },
  };
}

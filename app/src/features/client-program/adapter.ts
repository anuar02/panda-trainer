import type { ClientProgramExercise } from './client-program-screen';
import type { ClientPersonalProgram } from './service';
import type {
  ClientSchedule,
  ClientScheduleBooking,
} from '../client-scheduling/service';
import {
  clientScheduleHome,
  type ClientHomeBookingRow,
} from '../client-scheduling/adapter';

export type ClientProgramSession = ClientScheduleBooking &
  Pick<
    ClientHomeBookingRow,
    | 'id'
    | 'date'
    | 'start'
    | 'end'
    | 'startsAtUtc'
    | 'endsAtUtc'
    | 'today'
    | 'ongoing'
    | 'group'
  >;
export type ClientProgramSelection = {
  source: 'booking' | 'personal' | 'none';
  hasUpcoming: boolean;
  programName: string | null;
  program: { id: string; name: string; description: string } | null;
  session: ClientProgramSession | null;
  onSiteBooking: ClientProgramSession | null;
  exercises: ClientProgramExercise[];
};
const sessionOf = (row: ClientHomeBookingRow): ClientProgramSession => ({
  ...row.booking,
  id: row.id,
  date: row.date,
  start: row.start,
  end: row.end,
  startsAtUtc: row.startsAtUtc,
  endsAtUtc: row.endsAtUtc,
  today: row.today,
  ongoing: row.ongoing,
  group: row.group,
});
export function clientProgramSelection(
  schedule: ClientSchedule,
  now: Date,
  personal: ClientPersonalProgram | readonly ClientPersonalProgram[] | null,
): ClientProgramSelection {
  const home = clientScheduleHome(schedule, now);
  const session = home.bookings.find(
    (row) => row.booking.program?.exercises.length,
  );
  if (session?.booking.program) {
    const plan = session.booking.program;
    return {
      source: 'booking',
      hasUpcoming: true,
      programName: plan.name,
      program: { id: plan.id, name: plan.name, description: plan.description },
      session: sessionOf(session),
      onSiteBooking:
        home.next && home.next.id !== session.id ? sessionOf(home.next) : null,
      exercises: [...plan.exercises]
        .sort((a, b) => a.position - b.position)
        .map((line) => ({
          id: line.id,
          name: line.exercise_name_snapshot,
          sets: line.planned_sets,
          plannedReps: line.planned_reps,
          plannedSeconds: line.planned_seconds,
          weightGrams: line.planned_weight_g,
          restSeconds: line.rest_seconds,
          instructions: [...line.instructions_snapshot],
          equipment: line.equipment_snapshot,
          muscleGroup: line.muscle_group_snapshot,
          bodyweight: line.bodyweight_snapshot,
          note: line.note,
        })),
    };
  }
  if (home.bookings.length)
    return {
      source: 'none',
      hasUpcoming: home.bookings.length > 0,
      programName: null,
      program: null,
      session: null,
      onSiteBooking: null,
      exercises: [],
    };
  const copies: readonly ClientPersonalProgram[] =
    personal === null ? [] : 'id' in personal ? [personal] : personal;
  const plan = [...copies].sort(
    (a, b) =>
      Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc) ||
      b.id.localeCompare(a.id),
  )[0];
  if (!plan)
    return {
      source: 'none',
      hasUpcoming: home.bookings.length > 0,
      programName: null,
      program: null,
      session: null,
      onSiteBooking: null,
      exercises: [],
    };
  return {
    source: 'personal',
    hasUpcoming: false,
    programName: plan.name,
    program: { id: plan.id, name: plan.name, description: plan.description },
    session: null,
    onSiteBooking: null,
    exercises: [...plan.exercises]
      .sort((a, b) => a.position - b.position)
      .map((line) => ({
        id: line.id,
        name: line.name,
        sets: line.plannedSets,
        plannedReps: line.plannedReps,
        plannedSeconds: line.plannedSeconds,
        weightGrams: line.plannedWeightG,
        restSeconds: line.restSeconds,
        instructions: [...line.instructions],
        equipment: line.equipment,
        muscleGroup: line.muscleGroup,
        bodyweight: line.bodyweight,
        note: line.note,
      })),
  };
}

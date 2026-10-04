import type { Database } from '@/lib/database.types';
import { timestamp, uuid } from '@/features/workspace-clients/read-validation';
import { onboardingFailure } from './session';
import { isSafeOnboardingText } from './welcome-model';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Workspace =
  Database['public']['Tables']['trainer_workspaces']['Row'];
export type Connection =
  Database['public']['Functions']['list_my_client_connections']['Returns'][number];
export const focusCodes: Record<string, string> = {
  Силовые: 'strength',
  Функциональные: 'functional',
  Похудение: 'weight_loss',
  Реабилитация: 'rehabilitation',
  Бокс: 'boxing',
  Йога: 'yoga',
};
export const safeText = isSafeOnboardingText;
export function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw onboardingFailure();
  return value as Record<string, unknown>;
}
function audit(value: Record<string, unknown>) {
  if (
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 ||
    (value.revision as number) > 2147483647 ||
    !timestamp(value.created_at) ||
    !timestamp(value.updated_at) ||
    Date.parse(value.updated_at) < Date.parse(value.created_at) ||
    (value.created_by !== null && !uuid(value.created_by))
  )
    throw onboardingFailure();
}
export function parseProfile(value: unknown, actor: string): Profile | null {
  if (value === null) return null;
  const r = row(value);
  audit(r);
  if (
    r.user_id !== actor ||
    !safeText(r.display_name, 120) ||
    !safeText(r.locale, 64)
  )
    throw onboardingFailure();
  return {
    user_id: actor,
    display_name: r.display_name,
    locale: r.locale,
    revision: r.revision as number,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    created_by: r.created_by as string | null,
  };
}
const time = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(value);
export function parseWorkspace(
  value: unknown,
  actor: string,
): Workspace | null {
  if (value === null) return null;
  const r = row(value);
  audit(r);
  if (
    !uuid(r.id) ||
    r.owner_user_id !== actor ||
    !safeText(r.name, 120) ||
    !safeText(r.timezone, 100) ||
    !time(r.day_start) ||
    !time(r.day_end) ||
    r.day_start >= r.day_end ||
    ![45, 60, 90].includes(r.usual_session_minutes as number) ||
    !Array.isArray(r.training_focus) ||
    r.training_focus.length > 6 ||
    !r.training_focus.every(
      (v) => typeof v === 'string' && Object.values(focusCodes).includes(v),
    ) ||
    !Array.isArray(r.working_days) ||
    r.working_days.length < 1 ||
    r.working_days.length > 7 ||
    !r.working_days.every((v) => Number.isInteger(v) && v >= 0 && v <= 6)
  )
    throw onboardingFailure();
  try {
    new Intl.DateTimeFormat('en', { timeZone: r.timezone });
  } catch {
    throw onboardingFailure();
  }
  return {
    id: r.id,
    owner_user_id: actor,
    name: r.name,
    timezone: r.timezone,
    training_focus: [...r.training_focus] as string[],
    working_days: [...r.working_days] as number[],
    day_start: r.day_start,
    day_end: r.day_end,
    usual_session_minutes: r.usual_session_minutes as number,
    revision: r.revision as number,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    created_by: r.created_by as string | null,
  };
}
export function parseConnections(value: unknown): Connection[] {
  if (!Array.isArray(value)) throw onboardingFailure();
  const ids = new Set<string>();
  return value.map((value) => {
    const r = row(value);
    if (
      !uuid(r.client_record_id) ||
      !uuid(r.workspace_id) ||
      !safeText(r.trainer_name, 120) ||
      !safeText(r.client_name, 120) ||
      ids.has(r.client_record_id)
    )
      throw onboardingFailure();
    ids.add(r.client_record_id);
    return {
      client_record_id: r.client_record_id,
      workspace_id: r.workspace_id,
      trainer_name: r.trainer_name,
      client_name: r.client_name,
    };
  });
}
export function validateConnectionCard(value: unknown, actor: string) {
  const r = row(value);
  audit(r);
  if (
    !uuid(r.id) ||
    !uuid(r.workspace_id) ||
    r.user_id !== actor ||
    r.archived_at !== null ||
    !safeText(r.display_name, 120) ||
    (r.phone !== null && !safeText(r.phone, 80, true))
  )
    throw onboardingFailure();
  return { id: r.id, workspaceId: r.workspace_id, name: r.display_name };
}

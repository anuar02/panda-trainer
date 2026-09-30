import { workoutClients } from '@/domain/workout/fixtures';

export function routeScalar(value: unknown): string | undefined {
  const scalar: unknown = Array.isArray(value) ? value[0] : value;
  return typeof scalar === 'string' && scalar.length > 0 ? scalar : undefined;
}

export function routeDate(value: unknown): string | undefined {
  const date = routeScalar(value);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
    ? date
    : undefined;
}

export function routeTime(value: unknown): string | undefined {
  const time = routeScalar(value);
  return time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : undefined;
}

export function routeClientId(value: unknown): string | undefined {
  const clientId = routeScalar(value);
  return clientId &&
    Object.prototype.hasOwnProperty.call(workoutClients, clientId)
    ? clientId
    : undefined;
}

import { financialPageSize, financialRowLimit } from './read-auth';

export function financialPage(
  data: unknown,
  count: number | null,
  offset: number,
  previousCount: number | null,
  fail: () => never,
): { rows: unknown[]; count: number; done: boolean } {
  if (
    !Array.isArray(data) ||
    count === null ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > financialRowLimit ||
    (previousCount !== null && previousCount !== count) ||
    data.length !== Math.min(financialPageSize, Math.max(0, count - offset))
  )
    return fail();
  return { rows: data, count, done: offset + data.length === count };
}

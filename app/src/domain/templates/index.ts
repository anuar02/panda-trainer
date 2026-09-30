export type PlanExercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  target: number;
  rest: number;
  unit: 'сек' | 'повт';
};
export type Template = {
  id: string;
  name: string;
  description: string;
  custom?: boolean;
  exercises: PlanExercise[];
};
export type TemplateDraft = {
  id: string | null;
  name: string;
  description: string;
  exercises: (Omit<PlanExercise, 'sets' | 'target' | 'rest'> & {
    sets: string;
    target: string;
    rest: string;
  })[];
};
export type TemplateState = {
  version: 1;
  items: Template[];
  draft: TemplateDraft | null;
};
export const templateStorageKey = 'panda:demo:templates:v1';
export const emptyTemplates = (): TemplateState => ({
  version: 1,
  items: [],
  draft: null,
});
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const key = (value: string) => value.toLowerCase().replace(/ё/g, 'е').trim();
const nameValid = (value: unknown): value is string =>
  typeof value === 'string' &&
  !!value.trim() &&
  value.length <= 80 &&
  !['__proto__', 'prototype', 'constructor'].includes(value);
const integer = (value: unknown, min: number, max: number) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;
export function validPlan(value: unknown): value is PlanExercise[] {
  if (!Array.isArray(value) || !value.length || value.length > 50) return false;
  const ids = new Set<string>();
  return value.every((e) => {
    if (
      !object(e) ||
      !nameValid(e.id) ||
      ids.has(e.id) ||
      !nameValid(e.name) ||
      !integer(e.sets, 1, 20) ||
      typeof e.reps !== 'string' ||
      !/^\d{1,4}(?:[–-]\d{1,4})?(?: сек)?$/.test(e.reps) ||
      typeof e.target !== 'number' ||
      !Number.isFinite(e.target) ||
      e.target < 0 ||
      e.target > 1000 ||
      !integer(e.rest, 0, 600) ||
      !['сек', 'повт'].includes(String(e.unit))
    )
      return false;
    const range = e.reps.replace(/ сек$/, '').split(/[–-]/).map(Number);
    if (
      range.some((n) => n < 1 || n > (e.unit === 'сек' ? 3600 : 999)) ||
      (range.length === 2 && range[0]! > range[1]!)
    )
      return false;
    ids.add(e.id);
    return true;
  });
}
export function beginTemplate(
  template?: Template,
  copy = false,
): TemplateDraft {
  return template
    ? {
        id: copy ? null : template.id,
        name: template.name + (copy ? ' — копия' : ''),
        description: template.description,
        exercises: template.exercises.map((e) => ({
          ...e,
          sets: String(e.sets),
          reps: e.reps.replace(/\s*сек$/, ''),
          target: e.target ? String(e.target) : '',
          rest: String(e.rest),
        })),
      }
    : { id: null, name: '', description: '', exercises: [] };
}
export type TemplateError =
  | 'name'
  | 'duplicate'
  | 'empty'
  | 'limit'
  | 'exercise'
  | 'capacity'
  | 'storage';
export type TemplateResult =
  | { ok: true; template: Template }
  | { ok: false; error: TemplateError; index?: number };
export function prepareTemplate(
  draft: TemplateDraft,
  templates: readonly Template[],
  id: string,
): TemplateResult {
  const name = draft.name.trim().replace(/\s+/g, ' ');
  if (!nameValid(name)) return { ok: false, error: 'name' };
  if (templates.some((t) => t.id !== draft.id && key(t.name) === key(name)))
    return { ok: false, error: 'duplicate' };
  if (!draft.exercises.length) return { ok: false, error: 'empty' };
  if (draft.exercises.length > 50) return { ok: false, error: 'limit' };
  const exercises: PlanExercise[] = [];
  for (const [index, e] of draft.exercises.entries()) {
    const reps = e.reps
      .trim()
      .replace(/\s*сек\s*$/, '')
      .replace(/\s/g, '')
      .replace('-', '–');
    const exercise = {
      ...e,
      sets: Number(e.sets),
      reps: reps + (e.unit === 'сек' ? ' сек' : ''),
      target: Number((e.target || '0').replace(',', '.')),
      rest: Number(e.rest),
    };
    if (!validPlan([exercise]) || exercises.some((x) => x.id === e.id))
      return { ok: false, error: 'exercise', index };
    exercises.push(exercise);
  }
  if (!draft.id && templates.filter((t) => t.custom).length >= 100)
    return { ok: false, error: 'capacity' };
  return {
    ok: true,
    template: {
      id: draft.id ?? id,
      name,
      description: draft.description.trim().slice(0, 400),
      exercises,
      custom: true,
    },
  };
}
function validDraft(value: unknown): value is TemplateDraft {
  if (
    !object(value) ||
    !(value.id === null || nameValid(value.id)) ||
    typeof value.name !== 'string' ||
    value.name.length > 100 ||
    typeof value.description !== 'string' ||
    value.description.length > 400 ||
    !Array.isArray(value.exercises) ||
    value.exercises.length > 50
  )
    return false;
  const ids = new Set<string>();
  return value.exercises.every((e) => {
    if (
      !object(e) ||
      !nameValid(e.id) ||
      ids.has(e.id) ||
      !nameValid(e.name) ||
      !['сек', 'повт'].includes(String(e.unit)) ||
      !['sets', 'reps', 'target', 'rest'].every(
        (k) => typeof e[k] === 'string' && e[k].length <= 20,
      )
    )
      return false;
    ids.add(e.id);
    return true;
  });
}
export function decodeTemplates(raw: string | null): TemplateState | null {
  if (raw === null) return emptyTemplates();
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !object(value) ||
      value.version !== 1 ||
      !Array.isArray(value.items) ||
      value.items.length > 100 ||
      !(value.draft === null || validDraft(value.draft))
    )
      return null;
    const ids = new Set<string>(),
      names = new Set<string>();
    for (const t of value.items) {
      if (
        !object(t) ||
        !nameValid(t.id) ||
        ids.has(t.id) ||
        !nameValid(t.name) ||
        names.has(key(t.name)) ||
        typeof t.description !== 'string' ||
        t.description.length > 400 ||
        t.custom !== true ||
        !validPlan(t.exercises)
      )
        return null;
      ids.add(t.id);
      names.add(key(t.name));
    }
    return value as TemplateState;
  } catch {
    return null;
  }
}

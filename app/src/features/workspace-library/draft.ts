import {
  decodeTemplates,
  type Template,
  type TemplateDraft,
} from '@/domain/templates';

export type WorkspaceDraft = {
  draft: TemplateDraft | null;
  baseRevision: number | null;
  pendingSave?: {
    template: Template;
    requestId: string;
    expectedRevision: number | null;
  };
};
const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

export function decodeWorkspaceDraft(raw: string | null): WorkspaceDraft {
  if (raw === null) return { draft: null, baseRevision: null };
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null || !('draft' in value))
    throw new Error('Invalid workspace draft');
  if (!('baseRevision' in value)) throw new Error('Invalid workspace draft');
  const baseRevision = value.baseRevision;
  const state = decodeTemplates(
    JSON.stringify({ version: 1, items: [], draft: value.draft }),
  );
  if (
    !state ||
    (baseRevision !== null &&
      (typeof baseRevision !== 'number' ||
        !Number.isSafeInteger(baseRevision) ||
        baseRevision < 1)) ||
    (state.draft?.id ? baseRevision === null : baseRevision !== null)
  )
    throw new Error('Invalid workspace draft');
  if (!('pendingSave' in value)) return { draft: state.draft, baseRevision };
  const pending = value.pendingSave;
  if (
    typeof pending !== 'object' ||
    pending === null ||
    !('template' in pending) ||
    !('requestId' in pending) ||
    !('expectedRevision' in pending) ||
    typeof pending.requestId !== 'string' ||
    !uuid(pending.requestId) ||
    pending.expectedRevision !== baseRevision ||
    !state.draft
  )
    throw new Error('Invalid pending template save');
  const saved = decodeTemplates(
    JSON.stringify({ version: 1, items: [pending.template], draft: null }),
  );
  const template = saved?.items[0];
  if (
    !template ||
    !uuid(template.id) ||
    template.exercises.some((exercise) => !uuid(exercise.id)) ||
    (state.draft.id !== null && template.id !== state.draft.id)
  )
    throw new Error('Invalid pending template save');
  return {
    draft: state.draft,
    baseRevision,
    pendingSave: {
      template,
      requestId: pending.requestId,
      expectedRevision: baseRevision,
    },
  };
}

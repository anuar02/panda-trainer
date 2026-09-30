import type { SessionDraft } from '@/domain/scheduling';

export type EditorResult = { ok: true } | { ok: false; error: string };
export type EditorClient = {
  id: string;
  name: string;
  initials: string;
  meta?: string;
};
export type EditorTemplate = { program: string; name: string; meta: string };
export type EditorCollision = { id: string; start: string; title: string };
export type CreateSessionScreenProps = {
  clients: readonly EditorClient[];
  templates: readonly EditorTemplate[];
  dates: readonly string[];
  today: string;
  initialDate?: string;
  initialStart?: string;
  initialClientId?: string;
  getCollisions: (draft: SessionDraft) => readonly EditorCollision[];
  onCreate: (draft: SessionDraft) => EditorResult;
  onClose: () => void;
  disabled?: boolean;
  storageError?: string;
};
export type RescheduleSession = {
  id: string;
  date: string;
  start: string;
  end: string;
  clientName: string;
};
export type RescheduleSheetProps = {
  open: boolean;
  session: RescheduleSession;
  counter?: boolean;
  initialTarget?: { date: string; start: string };
  onSubmit: (target: { date: string; start: string }) => EditorResult;
  onClose: () => void;
  disabled?: boolean;
};

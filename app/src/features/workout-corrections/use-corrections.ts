import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createWorkoutPreloadReader } from '@/features/workout-preload/service';
import { randomUUID } from 'expo-crypto';
import type { PreloadParticipant } from '@/domain/workout-preload/types';
import type { SyncSession } from '@/domain/workout-sync/types';
import { createCorrectionTransport, type CorrectionTransport } from './service';
import {
  loadPendingCorrectionCommand,
  savePendingCorrectionCommand,
  clearPendingCorrectionCommand,
} from './pending';
import type { CorrectionCommand, CorrectionReview } from './types';

export function useWorkoutCorrections(
  session: SyncSession | null,
  getSession: () => SyncSession | null,
  participant: PreloadParticipant,
  onRefresh?: (participant: PreloadParticipant) => Promise<void>,
) {
  const [reviews, setReviews] = useState<CorrectionReview[]>([]);
  const [selected, setSelected] = useState<CorrectionReview | null>(null);
  const [pending, setPending] = useState<CorrectionCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorScope, setErrorScope] = useState<string | null>(null);
  const [, invalidate] = useState(0);
  const [applied, setApplied] = useState(false);
  const [reload, setReload] = useState(0);
  const runtime = useRef<{
    transport: CorrectionTransport;
    current: () => boolean;
    session: SyncSession;
    participantKey: string;
    inFlight: boolean;
  } | null>(null);
  const [scopeState, setScopeState] = useState<typeof runtime.current>(null);
  const participantKey = `${participant.workoutId}:${participant.bookingId}:${participant.clientRecordId}`;
  const accountId = session?.accountId;
  const workspaceId = session?.workspaceId;
  const sessionId = session?.sessionId;
  const getters = useRef({ getSession, onRefresh, participantKey });
  useLayoutEffect(() => {
    getters.current = { getSession, onRefresh, participantKey };
  }, [getSession, onRefresh, participantKey]);
  useEffect(() => {
    const session = getters.current.getSession();
    if (
      !session ||
      session.accountId !== accountId ||
      session.workspaceId !== workspaceId ||
      session.sessionId !== sessionId ||
      participant.workoutStatus !== 'finished'
    )
      return;
    let active = true;
    let transport: CorrectionTransport;
    try {
      transport = createCorrectionTransport({
        session,
        getSession: () => getters.current.getSession(),
        workoutId: participant.workoutId,
        url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
        anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        onInvalidated: () => {
          if (active) invalidate((value) => value + 1);
        },
      });
    } catch {
      void Promise.resolve().then(() => {
        if (active && getters.current.participantKey === participantKey) {
          setError('correction_request');
          setErrorScope(
            `${accountId}:${workspaceId}:${sessionId}:${participantKey}`,
          );
        }
      });
      return () => {
        active = false;
      };
    }
    const current = () =>
      active &&
      getters.current.participantKey === participantKey &&
      transport.valid();
    const captured = {
      transport,
      current,
      session: { ...session },
      participantKey: `${participant.workoutId}:${participant.bookingId}:${participant.clientRecordId}`,
      inFlight: false,
    };
    runtime.current = captured;
    void (async () => {
      await Promise.resolve();
      if (!current()) return;
      setBusy(false);
      setReviews([]);
      setSelected(null);
      setPending(null);
      setError(null);
      setErrorScope(null);
      setApplied(false);
      setScopeState(captured);
      setBusy(true);
      try {
        const command = await loadPendingCorrectionCommand(
          session.accountId,
          session.workspaceId,
          participant.workoutId,
          current,
        );
        if (!current()) return;
        setPending(command);
        if (command) {
          const review = await transport.review(command.draftId);
          if (!current()) return;
          setSelected(review);
        }
        const next = await transport.list();
        if (!current()) return;
        setReviews(next);
      } catch {
        if (current()) setError('correction_request');
      } finally {
        if (current()) setBusy(false);
      }
    })();
    return () => {
      active = false;
      transport.dispose();
      if (runtime.current === captured) runtime.current = null;
    };
  }, [
    accountId,
    workspaceId,
    sessionId,
    participantKey,
    participant.workoutId,
    participant.bookingId,
    participant.clientRecordId,
    participant.workoutStatus,
    reload,
  ]);
  async function confirm() {
    const captured = runtime.current;
    if (
      !captured ||
      !captured.current() ||
      captured.inFlight ||
      busy ||
      (!selected && !pending)
    )
      return;
    const { transport, current, session: actor } = captured;
    if (
      selected &&
      (selected.account_id !== actor.accountId.toLowerCase() ||
        selected.workspace_id !== actor.workspaceId.toLowerCase() ||
        selected.workout_id !== transport.scope.workoutId)
    )
      return;
    const command = pending ?? {
      draftId: selected!.draft_id,
      requestId: randomUUID(),
      expectedWorkoutRevision: selected!.workout_revision,
      expectedEntityRevision: selected!.entity_revision,
      expectedExerciseRevision: selected!.exercise_revision,
    };
    captured.inFlight = true;
    setBusy(true);
    setError(null);
    setApplied(false);
    try {
      await savePendingCorrectionCommand(
        actor.accountId,
        actor.workspaceId,
        transport.scope.workoutId,
        command,
        current,
      );
      if (!current()) return;
      setPending(command);
      const receipt = await transport.apply(command);
      if (!current()) return;
      const journal = await transport.review(command.draftId);
      if (!current()) return;
      if (
        journal.workout_revision < receipt.revision ||
        journal.applied_request_id !== command.requestId ||
        !journal.applied_at ||
        journal.finished_at !== receipt.finished_at ||
        !journal.receipt ||
        journal.receipt.request_id !== receipt.request_id ||
        journal.receipt.revision !== receipt.revision ||
        journal.receipt.finished_at !== receipt.finished_at ||
        (selected && selected.finished_at !== receipt.finished_at)
      )
        throw new Error('correction_readback');
      const refreshed = await createWorkoutPreloadReader().load(
        await transport.verifiedSession(),
        participant.bookingId,
        new AbortController().signal,
      );
      if (!current()) return;
      const nextParticipant = refreshed.participants.find(
        (item) =>
          item.workoutId === transport.scope.workoutId &&
          item.bookingId === participant.bookingId &&
          item.clientRecordId === participant.clientRecordId,
      );
      if (
        !nextParticipant ||
        nextParticipant.workoutStatus !== 'finished' ||
        nextParticipant.workoutRevision < receipt.revision
      )
        throw new Error('correction_readback');
      await getters.current.onRefresh?.(nextParticipant);
      if (!current()) return;
      const cleared = await clearPendingCorrectionCommand(
        actor.accountId,
        actor.workspaceId,
        transport.scope.workoutId,
        command.requestId,
        current,
      );
      if (!current()) return;
      if (!cleared) throw new Error('correction_storage');
      const next = await transport.list();
      if (!current()) return;
      setPending(null);
      setSelected(null);
      setApplied(true);
      if (current()) setReviews(next);
    } catch (failure) {
      if (current())
        setError(
          failure instanceof Error &&
            [
              'correction_conflict',
              'correction_not_found',
              'correction_stale',
              'correction_unavailable',
              'correction_session_changed',
              'correction_storage',
              'correction_readback',
              'correction_response',
            ].includes(failure.message)
            ? failure.message
            : 'correction_request',
        );
    } finally {
      captured.inFlight = false;
      if (current()) setBusy(false);
    }
  }
  const capturedScope = scopeState;
  const visible =
    !!session &&
    participant.workoutStatus === 'finished' &&
    !!capturedScope &&
    capturedScope.current() &&
    capturedScope.session.accountId === session.accountId &&
    capturedScope.session.workspaceId === session.workspaceId &&
    capturedScope.session.sessionId === session.sessionId &&
    capturedScope.participantKey ===
      `${participant.workoutId}:${participant.bookingId}:${participant.clientRecordId}`;
  return {
    reviews: visible ? reviews : [],
    selected: visible ? selected : null,
    pending: visible ? pending : null,
    busy: visible && busy,
    error:
      visible ||
      errorScope ===
        `${accountId}:${workspaceId}:${sessionId}:${participantKey}`
        ? error
        : null,
    applied: visible && applied,
    confirm,
    review: async (draftId: string) => {
      const captured = runtime.current;
      if (
        !captured ||
        !captured.current() ||
        captured.inFlight ||
        busy ||
        pending
      )
        return;
      captured.inFlight = true;
      setBusy(true);
      setError(null);
      try {
        const value = await captured.transport.review(draftId);
        if (captured.current()) setSelected(value);
      } catch {
        if (captured.current()) setError('correction_request');
      } finally {
        captured.inFlight = false;
        if (captured.current()) setBusy(false);
      }
    },
    cancel: () => {
      if (!busy) setSelected(null);
    },
    reload: () => {
      if (!busy) setReload((value) => value + 1);
    },
  };
}

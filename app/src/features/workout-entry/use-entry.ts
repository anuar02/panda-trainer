import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import type { PreloadParticipant } from '@/domain/workout-preload/types';
import type {
  JsonValue,
  SyncSession,
  SyncState,
} from '@/domain/workout-sync/types';
import {
  openOutboxStore,
  createOutboxRunner,
  createWorkoutSyncTransport,
} from '@/features/workout-sync';
import { WorkoutEntryService, type EntryRead } from './service';
import { openEntryDraftStore } from './storage';
import { createWorkoutPreloadReader } from '@/features/workout-preload/service';
import { openWorkoutPreloadStore } from '@/features/workout-preload/storage';
import { registerEntryWriter } from './coordination';
import { loadEntryResources } from './resources';
import { entrySessionIdentity } from './session-identity';

function freshestParticipant(
  current: PreloadParticipant,
  candidate?: PreloadParticipant,
) {
  if (
    !candidate ||
    candidate.workoutId !== current.workoutId ||
    candidate.bookingId !== current.bookingId ||
    candidate.clientRecordId !== current.clientRecordId ||
    candidate.workoutRevision < current.workoutRevision ||
    (candidate.workoutRevision === current.workoutRevision &&
      current.workoutStatus === 'finished' &&
      candidate.workoutStatus !== 'finished')
  )
    return current;
  return candidate;
}

function entryKey(
  session: SyncSession | null,
  participant: PreloadParticipant,
) {
  return JSON.stringify([
    entrySessionIdentity(session),
    session?.accountId,
    session?.workspaceId,
    session?.sessionId,
    participant.workoutId,
    participant.bookingId,
    participant.clientRecordId,
  ]);
}

type Resources = Awaited<ReturnType<typeof loadEntryResources>>;
export function useWorkoutEntry(
  session: SyncSession | null,
  getSession: () => SyncSession | null,
  participant: PreloadParticipant,
) {
  const lifecycle = entrySessionIdentity(session);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<EntryRead | null>(null);
  const [resources, setResources] = useState<Resources>({
    catalog: [],
    conflicts: [],
  });
  const [sync, setSync] = useState<SyncState | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const runtime = useRef<{
    service: WorkoutEntryService;
    actions: number;
    run: () => Promise<void>;
    cache: (value: Resources) => Promise<void>;
  } | null>(null);
  const currentParticipant = useRef(participant);
  const finishInFlight = useRef(false);

  const currentSession = useRef(getSession);
  useLayoutEffect(() => {
    currentParticipant.current = participant;
  }, [participant, session]);
  useLayoutEffect(() => {
    currentSession.current = getSession;
  }, [getSession]);
  useEffect(() => {
    const selected = currentParticipant.current;
    let active = true;
    const controller = new AbortController();
    let dispose: (() => Promise<void>) | undefined;
    const captured = session ? { ...session } : null;
    const valid = () => {
      const current = currentSession.current();
      return (
        active &&
        currentParticipant.current.workoutId === selected.workoutId &&
        currentParticipant.current.bookingId === selected.bookingId &&
        currentParticipant.current.clientRecordId === selected.clientRecordId &&
        captured !== null &&
        current?.accountId === captured.accountId &&
        current.workspaceId === captured.workspaceId &&
        current.sessionId === captured.sessionId &&
        current.accessToken === captured.accessToken
      );
    };
    if (captured)
      void (async () => {
        const outbox = await openOutboxStore(captured);
        let drafts: Awaited<ReturnType<typeof openEntryDraftStore>>;
        try {
          drafts = await openEntryDraftStore(captured);
        } catch (failure) {
          await outbox.close();
          throw failure;
        }
        if (!valid()) {
          await drafts.close();
          await outbox.close();
          return;
        }
        const runner = createOutboxRunner({
          store: outbox,
          transport: createWorkoutSyncTransport({
            url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
            anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
          }),
          getSession: () => (valid() ? captured : null),
          onState: (next) => {
            if (valid()) setSync(next);
          },
        });
        dispose = async () => {
          runner.stop();
          await drafts.close();
          await outbox.close();
        };
        const deviceId = await drafts.getDeviceId(randomUUID);
        if (!valid()) {
          await drafts.close();
          await outbox.close();
          return;
        }
        let cacheError = false;
        try {
          const cache = await openWorkoutPreloadStore(captured);
          try {
            const context = await cache.read(selected.bookingId);
            if (!valid()) return;
            const saved = context?.participants.find(
              (value) =>
                value.workoutId === selected.workoutId &&
                value.bookingId === selected.bookingId,
            );
            currentParticipant.current = freshestParticipant(
              currentParticipant.current,
              saved,
            );
          } finally {
            await cache.close();
          }
        } catch {
          cacheError = true;
        }
        const service = new WorkoutEntryService({
          session: captured,
          isParticipantCurrent: (value) =>
            valid() &&
            value.workoutId === currentParticipant.current.workoutId &&
            value.bookingId === currentParticipant.current.bookingId &&
            value.clientRecordId === currentParticipant.current.clientRecordId,
          getSession: () => (valid() ? captured : null),
          outbox,
          drafts,
          deviceId,
          newId: randomUUID,
          now: () => new Date().toISOString(),
        });
        const unregister = registerEntryWriter(captured, () => service.flush());
        dispose = async () => {
          unregister();
          runner.stop();
          await service.flush();
          await drafts.close();
          await outbox.close();
        };
        if (!valid()) return;
        runtime.current = {
          service,
          actions: 0,
          cache: async (value) => {
            if (valid())
              await drafts.saveResources(
                selected.workoutId,
                value as unknown as JsonValue,
              );
          },
          run: async () => {
            await runner.run();
          },
        };
        if (valid()) {
          setLoadedKey(entryKey(captured, selected));
          setState(null);
          setError(cacheError);
          setBusy(false);
          setSync(null);
          setResources({ catalog: [], conflicts: [] });
        }
        const cached = await drafts.readResources(selected.workoutId);
        if (
          valid() &&
          cached &&
          typeof cached === 'object' &&
          !Array.isArray(cached) &&
          Array.isArray(cached.catalog) &&
          Array.isArray(cached.conflicts)
        )
          setResources(cached as unknown as Resources);
        const restored = await service.read(currentParticipant.current);
        if (valid()) setState(restored);
        try {
          const loaded = await loadEntryResources(
            captured,
            selected.workoutId,
            controller.signal,
          );
          if (valid()) {
            await drafts.saveResources(
              selected.workoutId,
              loaded as unknown as JsonValue,
            );
            if (valid()) setResources(loaded);
          }
        } catch {}
      })().catch(() => {
        if (valid()) {
          setLoadedKey(entryKey(captured, selected));
          setError(true);
        }
      });
    return () => {
      active = false;
      controller.abort();
      runtime.current = null;
      finishInFlight.current = false;
      void dispose?.().catch(() => {});
    };
  }, [
    session,
    lifecycle,
    participant.workoutId,
    participant.bookingId,
    participant.clientRecordId,
    attempt,
  ]);
  useEffect(() => {
    const service = runtime.current?.service;
    const captured = session ? { ...session } : null;
    const valid = () => {
      const current = currentSession.current();
      return (
        active &&
        runtime.current?.service === service &&
        current?.accountId === captured?.accountId &&
        current?.workspaceId === captured?.workspaceId &&
        current?.sessionId === captured?.sessionId &&
        current?.accessToken === captured?.accessToken &&
        currentParticipant.current.workoutId === participant.workoutId &&
        currentParticipant.current.bookingId === participant.bookingId &&
        currentParticipant.current.clientRecordId === participant.clientRecordId
      );
    };
    let active = true;
    if (service)
      void service
        .read(participant)
        .then((next) => {
          if (valid()) setState(next);
        })
        .catch(() => {
          if (valid()) setError(true);
        });
    return () => {
      active = false;
    };
  }, [participant, session, lifecycle]);
  async function execute(
    action: (
      service: WorkoutEntryService,
      isCurrent?: () => boolean,
    ) => Promise<EntryRead | void>,
    syncWrite = true,
  ) {
    const captured = session ? { ...session } : null;
    const instance = runtime.current;
    const selected = currentParticipant.current;
    const workoutId = selected.workoutId;
    const valid = () =>
      captured !== null &&
      currentSession.current()?.accountId === captured.accountId &&
      currentSession.current()?.workspaceId === captured.workspaceId &&
      currentSession.current()?.accessToken === captured.accessToken &&
      currentSession.current()?.sessionId === captured.sessionId &&
      runtime.current === instance &&
      currentParticipant.current.workoutId === workoutId &&
      currentParticipant.current.bookingId === selected.bookingId &&
      currentParticipant.current.clientRecordId === selected.clientRecordId;
    if (!instance || !valid()) return;
    instance.actions += 1;
    setBusy(true);
    setError(false);
    try {
      const next = await action(instance.service, valid);
      if (!valid()) return;
      if (next) setState(next);
      else {
        const refreshed = await instance.service.read(
          currentParticipant.current,
        );
        if (valid()) setState(refreshed);
      }
      if (!syncWrite) return;
      const pending = await instance.service.pendingCount();
      if (!valid()) return;
      setSync({ status: 'saved_on_phone', pending });
      void instance
        .run()
        .then(async () => {
          if (!valid()) return;
          let refreshed = currentParticipant.current;
          if (captured) {
            try {
              const context = await createWorkoutPreloadReader().load(
                captured,
                refreshed.bookingId,
                new AbortController().signal,
              );
              if (!valid()) return;
              refreshed = freshestParticipant(
                currentParticipant.current,
                context.participants.find(
                  (value) =>
                    value.bookingId === selected.bookingId &&
                    value.workoutId === workoutId &&
                    value.clientRecordId === selected.clientRecordId,
                ),
              );
              currentParticipant.current = refreshed;
              const cache = await openWorkoutPreloadStore(captured);
              try {
                if (!valid()) return;
                refreshed = freshestParticipant(
                  currentParticipant.current,
                  refreshed,
                );
                await cache.save({
                  ...context,
                  participants: context.participants.map((value) =>
                    value.workoutId === refreshed.workoutId &&
                    value.bookingId === refreshed.bookingId &&
                    value.clientRecordId === refreshed.clientRecordId
                      ? refreshed
                      : value,
                  ),
                });
                if (!valid()) return;
              } catch {
                if (valid()) setError(true);
              } finally {
                await cache.close();
              }
            } catch {}
          }
          const restored = await instance.service.read(refreshed);
          if (valid()) setState(restored);
          if (captured) {
            try {
              const loaded = await loadEntryResources(
                captured,
                participant.workoutId,
                new AbortController().signal,
              );
              if (valid()) {
                await instance.cache(loaded);
                if (valid()) setResources(loaded);
              }
            } catch {}
          }
        })
        .catch(() => {});
    } catch {
      if (valid()) setError(true);
    } finally {
      instance.actions -= 1;
      if (valid()) setBusy(instance.actions > 0);
    }
  }
  const visible = loadedKey === entryKey(session, participant);
  return {
    state: visible ? state : null,
    resources: visible ? resources : { catalog: [], conflicts: [] },
    sync: visible ? sync : null,
    error: visible && error,
    busy: visible && busy,
    execute,
    finish: async () => {
      if (finishInFlight.current) return;
      const instance = runtime.current;
      finishInFlight.current = true;
      try {
        await execute((service) => service.finish(currentParticipant.current));
      } finally {
        if (runtime.current === instance) finishInFlight.current = false;
      }
    },
    retry: () => setAttempt((value) => value + 1),
    retryDelivery: () =>
      execute((service) => service.read(currentParticipant.current)),
  };
}

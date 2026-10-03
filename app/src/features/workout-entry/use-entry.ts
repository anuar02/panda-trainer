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
import { registerEntryWriter } from './coordination';
import { loadEntryResources } from './resources';

type Resources = Awaited<ReturnType<typeof loadEntryResources>>;
export function useWorkoutEntry(
  session: SyncSession | null,
  getSession: () => SyncSession | null,
  participant: PreloadParticipant,
) {
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
    run: () => Promise<void>;
    cache: (value: Resources) => Promise<void>;
  } | null>(null);
  const currentParticipant = useRef(participant);

  const currentSession = useRef(getSession);
  useLayoutEffect(() => {
    currentParticipant.current = participant;
    currentSession.current = getSession;
  }, [participant, getSession]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let dispose: (() => Promise<void>) | undefined;
    const captured = session;
    const valid = () => {
      const current = currentSession.current();
      return (
        active &&
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
        const service = new WorkoutEntryService({
          session: captured,
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
        runtime.current = {
          service,
          cache: async (value) => {
            if (valid())
              await drafts.saveResources(
                participant.workoutId,
                value as unknown as JsonValue,
              );
          },
          run: async () => {
            await runner.run();
          },
        };
        if (valid()) {
          setLoadedKey(captured.sessionId);
          setState(null);
          setError(false);
          setResources({ catalog: [], conflicts: [] });
        }
        const cached = await drafts.readResources(participant.workoutId);
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
            participant.workoutId,
            controller.signal,
          );
          if (valid()) {
            await drafts.saveResources(
              participant.workoutId,
              loaded as unknown as JsonValue,
            );
            if (valid()) setResources(loaded);
          }
        } catch {}
      })().catch(() => {
        if (valid()) {
          setLoadedKey(captured.sessionId);
          setError(true);
        }
      });
    return () => {
      active = false;
      controller.abort();
      runtime.current = null;
      void dispose?.().catch(() => {});
    };
  }, [session, participant.workoutId, attempt]);
  useEffect(() => {
    const service = runtime.current?.service;
    let active = true;
    if (service)
      void service
        .read(participant)
        .then((next) => {
          if (active && runtime.current?.service === service) setState(next);
        })
        .catch(() => {
          if (active && runtime.current?.service === service) setError(true);
        });
    return () => {
      active = false;
    };
  }, [participant]);
  async function execute(
    action: (service: WorkoutEntryService) => Promise<EntryRead | void>,
    syncWrite = true,
  ) {
    const captured = session;
    const instance = runtime.current;
    const valid = () =>
      captured !== null &&
      currentSession.current()?.sessionId === captured.sessionId &&
      runtime.current === instance;
    if (!instance || !valid()) return;
    setBusy(true);
    setError(false);
    try {
      const next = await action(instance.service);
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
              refreshed =
                context.participants.find(
                  (value) => value.bookingId === refreshed.bookingId,
                ) ?? refreshed;
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
      if (valid()) setBusy(false);
    }
  }
  const visible = loadedKey === session?.sessionId;
  return {
    state: visible ? state : null,
    resources: visible ? resources : { catalog: [], conflicts: [] },
    sync: visible ? sync : null,
    error: visible && error,
    busy: visible && busy,
    execute,
    retry: () => setAttempt((value) => value + 1),
    retryDelivery: () =>
      execute((service) => service.read(currentParticipant.current)),
  };
}

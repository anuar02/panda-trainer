import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SyncSession } from '@/domain/workout-sync/types';
import type { PreloadParticipant } from '@/domain/workout-preload/types';
import { createProgramUpdateTransport } from './service';
import { createUpdateController, type UpdateState } from './controller';
export function useProgramUpdate(
  session: SyncSession | null,
  getSession: () => SyncSession | null,
  participant: PreloadParticipant,
) {
  const [openedScope, setOpenedScope] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<UpdateState | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [lifetime, setLifetime] = useState<{
    scope: string;
    valid(): boolean;
  } | null>(null);
  const scope = `${session?.accountId}:${session?.workspaceId}:${session?.sessionId}:${participant.clientRecordId}:${participant.workoutId}:${participant.workoutRevision}`;
  const currentScope = useRef(scope);
  const getter = useRef(getSession);
  useLayoutEffect(() => {
    currentScope.current = scope;
    getter.current = getSession;
  }, [scope, getSession]);
  const runtime = useRef<{
    scope: string;
    controller: ReturnType<typeof createUpdateController>;
    valid(): boolean;
    dispose(): void;
  } | null>(null);
  const accountId = session?.accountId;
  const workspaceId = session?.workspaceId;
  const sessionId = session?.sessionId;
  useEffect(() => {
    const session = getter.current();
    if (
      !session ||
      session.accountId !== accountId ||
      session.workspaceId !== workspaceId ||
      session.sessionId !== sessionId ||
      participant.workoutStatus !== 'finished'
    )
      return;
    let active = true;
    let dispose = () => {};
    try {
      const transport = createProgramUpdateTransport({
        session,
        getSession: () => getter.current(),
        clientRecordId: participant.clientRecordId,
        workoutId: participant.workoutId,
        url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
        anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        onInvalidated: () => {
          if (active) setInvalid(true);
        },
      });
      dispose = transport.dispose;
      const current = () =>
        active && currentScope.current === scope && transport.valid();
      const controller = createUpdateController({
        transport,
        actorId: session.accountId,
        workspaceId: session.workspaceId,
        workoutId: participant.workoutId,
        clientRecordId: participant.clientRecordId,
        current,
        changed: setState,
      });
      const captured = {
        scope,
        controller,
        valid: current,
        dispose: transport.dispose,
      };
      runtime.current = captured;
      void Promise.resolve().then(() => {
        if (current()) setLifetime(captured);
      });
      void controller.load();
      return () => {
        active = false;
        transport.dispose();
        if (runtime.current === captured) runtime.current = null;
      };
    } catch {
      void Promise.resolve().then(() => {
        if (active) setInvalid(true);
      });
    }
    return () => {
      active = false;
      dispose();
    };
  }, [
    scope,
    accountId,
    workspaceId,
    sessionId,
    participant.clientRecordId,
    participant.workoutId,
    participant.workoutStatus,
    generation,
  ]);
  const visible = lifetime?.scope === scope && lifetime.valid();
  return {
    state: visible ? state : null,
    opened: openedScope === scope && visible,
    invalid,
    open: () => {
      setOpenedScope(scope);
      setInvalid(false);
      setGeneration((x) => x + 1);
    },
    close: () => {
      runtime.current?.dispose();
      runtime.current = null;
      setOpenedScope(null);
      setState(null);
      setGeneration((x) => x + 1);
    },
    confirm: () => runtime.current?.controller.confirm(),
    toggle: (key: string) => runtime.current?.controller.toggle(key),
    reload: () => runtime.current?.controller.load(),
    reject: async () => {
      const captured = runtime.current;
      await captured?.controller.reject();
      if (captured === runtime.current && captured?.valid())
        await captured.controller.load();
    },
  };
}

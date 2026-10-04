import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/features/auth/provider';
import { getSupabaseClient } from '@/features/auth/client';
import {
  completeTrainerOnboarding,
  loadOnboardingContext,
  type OnboardingContext,
} from './service';
import { onboardingIdentity, onboardingFailure } from './session';
import type { TrainerOnboardingDraft } from './welcome-model';

type Lifecycle = {
  key: string;
  attempt: number;
  epoch: number;
  generation: number;
  abort: AbortController;
  token: string | undefined;
};
type LoadedContext = {
  key: string;
  attempt: number;
  epoch: number;
  generation: number;
  token: string | undefined;
  context: OnboardingContext | null;
  failed: boolean;
  loading: boolean;
};

export function useOnboardingContext() {
  const auth = useAuth();
  const identity = onboardingIdentity(auth.session);
  const key = `${identity?.userId ?? ''}:${identity?.sessionId ?? ''}:${auth.loading}:${auth.failed}`;
  const [attempt, setAttempt] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [loaded, setLoaded] = useState<LoadedContext | null>(null);
  const currentSession = useRef(auth.session);
  const sequence = useRef(0);
  const lifecycle = useRef<Lifecycle | null>(null);
  useLayoutEffect(() => {
    currentSession.current = auth.session;
    if (
      lifecycle.current?.key !== key ||
      lifecycle.current.attempt !== attempt ||
      lifecycle.current.epoch !== epoch ||
      lifecycle.current.token !== auth.session?.access_token
    ) {
      lifecycle.current?.abort.abort();
      lifecycle.current = null;
    }
  }, [auth.session, key, attempt, epoch]);
  useFocusEffect(
    useCallback(() => {
      const abort = new AbortController();
      const generation = ++sequence.current;
      const session = currentSession.current;
      const instance = {
        key,
        attempt,
        epoch,
        generation,
        abort,
        token: session?.access_token,
      };
      lifecycle.current = instance;
      const expected = onboardingIdentity(session);
      const isCurrent = () =>
        lifecycle.current === instance && !abort.signal.aborted;
      const publish = (
        context: OnboardingContext | null,
        failed: boolean,
        loading = false,
      ) => {
        if (isCurrent())
          setLoaded({
            key,
            attempt,
            epoch,
            generation,
            token: instance.token,
            context,
            failed,
            loading,
          });
      };
      const listener = getSupabaseClient()?.auth.onAuthStateChange(
        (event, next) => {
          const nextIdentity = onboardingIdentity(next);
          const same =
            nextIdentity &&
            expected &&
            nextIdentity.userId === expected.userId &&
            nextIdentity.sessionId === expected.sessionId;
          if (event === 'TOKEN_REFRESHED' && same) {
            instance.token = next?.access_token;
            setLoaded((value) =>
              value?.generation === generation
                ? { ...value, token: instance.token }
                : value,
            );
          } else if (
            event === 'INITIAL_SESSION' &&
            same &&
            next?.access_token === instance.token
          )
            return;
          else if (
            event === 'SIGNED_IN' ||
            event === 'SIGNED_OUT' ||
            !same ||
            next?.access_token !== instance.token
          ) {
            abort.abort();
            if (lifecycle.current === instance) {
              setLoaded(null);
              setEpoch((value) => value + 1);
            }
          }
        },
      );
      publish(null, false, true);
      if (!expected || !session || auth.loading || auth.failed)
        publish(null, true);
      else
        void loadOnboardingContext({
          userId: expected.userId,
          token: session.access_token,
          signal: abort.signal,
          isCurrent,
        }).then(
          (context) => publish(context, false),
          () => publish(null, true),
        );
      return () => {
        abort.abort();
        listener?.data.subscription.unsubscribe();
        if (lifecycle.current === instance) lifecycle.current = null;
      };
    }, [key, attempt, epoch, auth.loading, auth.failed]),
  );
  const matches =
    loaded?.key === key &&
    loaded?.attempt === attempt &&
    loaded?.epoch === epoch;
  const credentialMismatch = Boolean(
    matches && loaded?.token !== auth.session?.access_token,
  );
  const current = matches && !credentialMismatch ? loaded : null;
  const generation = current?.generation;
  const isCurrent = () => {
    const instance = lifecycle.current;
    return Boolean(
      instance &&
      instance.key === key &&
      instance.attempt === attempt &&
      instance.epoch === epoch &&
      instance.generation === generation &&
      !instance.abort.signal.aborted,
    );
  };
  return {
    context: current?.context ?? null,
    failed: credentialMismatch || (current?.failed ?? false),
    loading:
      Boolean(auth.session) &&
      (current === null || current.loading) &&
      !credentialMismatch,
    generation,
    isCurrent,
    complete: async (draft: TrainerOnboardingDraft) => {
      const session = currentSession.current;
      const instance = lifecycle.current;
      if (!isCurrent() || !session || !current?.context || !instance)
        throw onboardingFailure();
      const result = await completeTrainerOnboarding(draft, {
        userId: current.context.userId,
        token: session.access_token,
        signal: instance.abort.signal,
        isCurrent,
      });
      if (!isCurrent()) throw onboardingFailure();
      return result;
    },
    retry: () => {
      const instance = lifecycle.current;
      if (
        !instance ||
        instance.key !== key ||
        instance.attempt !== attempt ||
        instance.epoch !== epoch ||
        instance.generation !== loaded?.generation
      )
        return;
      instance.abort.abort();
      setAttempt((value) => value + 1);
    },
  };
}

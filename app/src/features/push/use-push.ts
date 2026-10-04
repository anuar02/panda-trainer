import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/features/auth/provider';
import { onboardingIdentity } from '@/features/onboarding/session';
import { nativePushController, nativePushAdapter } from './native';
import { setPushDetach } from './logout';
export function usePush() {
  const { session } = useAuth();
  useEffect(() => {
    setPushDetach(() => nativePushController.detach());
    return () => {
      setPushDetach(null);
      void nativePushController.detach().catch(() => undefined);
    };
  }, []);
  useEffect(() => {
    const identity = session ? onboardingIdentity(session) : null;
    const owner =
      identity && session
        ? {
            userId: identity.userId,
            sessionId: identity.sessionId,
            token: session.access_token,
          }
        : null;
    const update = () => {
      void nativePushController.update(owner).catch(() => undefined);
    };
    update();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => {
      listener.remove();
    };
  }, [session]);
  return nativePushAdapter.supported();
}

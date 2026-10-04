import { nativePushController } from './native';
import { authService } from '@/features/auth/service';
import { onboardingIdentity } from '@/features/onboarding/session';
import { useAuth } from '@/features/auth/provider';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { usePush } from './use-push';
import { pushOpenPayload } from './routing';
let pending: ReturnType<typeof pushOpenPayload> = null;
export function PushObserver() {
  const { session } = useAuth();
  const currentSession = useRef(session);
  useLayoutEffect(() => {
    currentSession.current = session;
  }, [session]);
  const supported = usePush();
  const router = useRouter();
  const segments: readonly string[] = useSegments();
  const signingIn =
    segments[0] === 'auth' &&
    ['sign-in', 'callback'].includes(segments[1] ?? '');
  useEffect(() => {
    if (session && pending && !signingIn) {
      const payload = pending;
      pending = null;
      router.push({ pathname: '/push-open', params: payload });
    }
  }, [session, router, signingIn]);
  useEffect(() => {
    if (!supported) return;
    let live = true;
    const seen = new Set<string>();
    const open = (response: Notifications.NotificationResponse | null) => {
      if (
        !live ||
        !response ||
        seen.has(response.notification.request.identifier)
      )
        return;
      seen.add(response.notification.request.identifier);
      const payload = pushOpenPayload(
        response.notification.request.content.data,
      );
      pending = currentSession.current ? null : payload;
      router.push({
        pathname: '/push-open',
        params: payload ?? { invalid: '1' },
      });
      void Notifications.clearLastNotificationResponseAsync().catch(
        () => undefined,
      );
    };
    const response =
      Notifications.addNotificationResponseReceivedListener(open);
    const rotation = Notifications.addPushTokenListener(() => {
      void nativePushControllerUpdate();
    });
    void Notifications.getLastNotificationResponseAsync()
      .then(open)
      .catch(() => undefined);
    return () => {
      live = false;
      response.remove();
      rotation.remove();
    };
  }, [router, supported]);
  return null;
}
async function nativePushControllerUpdate() {
  try {
    const session = await authService.getSession();
    const identity = session && onboardingIdentity(session);
    if (session && identity)
      await nativePushController.update({
        userId: identity.userId,
        sessionId: identity.sessionId,
        token: session.access_token,
      });
  } catch {
    return;
  }
}

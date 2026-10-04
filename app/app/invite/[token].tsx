import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { ClientInvitationScreen } from '@/features/invitations/screens';
import { useInvitationLifecycle } from '@/features/invitations/use-invitation-lifecycle';
import {
  createInvitationFence,
  InvitationSessionError,
} from '@/features/invitations/session';
import { pendingInvitationToken } from '@/features/invitations/pending';
import {
  acceptInvitation,
  isInvitationToken,
  InvitationServiceError,
  type InvitationAcceptance,
} from '@/features/invitations/service';

function Invitation({
  token,
  authenticated,
  lifecycle,
}: {
  token: string;
  authenticated: boolean;
  lifecycle: ReturnType<typeof useInvitationLifecycle>;
}) {
  const { t } = useTranslation();
  const valid = isInvitationToken(token);
  const { isCurrent } = lifecycle;
  const [stored, setStored] = useState<{
    attempt: number;
    failed: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(!valid);
  const [accepted, setAccepted] = useState<InvitationAcceptance | null>(null);
  const ready = !valid || stored?.attempt === attempt;
  const storageFailed = ready && stored?.failed;
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!valid) return;
    let active = true;
    void pendingInvitationToken.set(token, isCurrent).then(
      () => {
        if (active && isCurrent()) setStored({ attempt, failed: false });
      },
      () => {
        if (active && isCurrent()) setStored({ attempt, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [token, valid, attempt, isCurrent]);
  const run = async (operation: () => Promise<void>) => {
    if (pending.current || !lifecycle.isCurrent()) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      if (caught instanceof InvitationSessionError) return;
      if (mounted.current && lifecycle.isCurrent())
        setError(t('auth.actionError'));
    } finally {
      pending.current = false;
      if (mounted.current && lifecycle.isCurrent()) setBusy(false);
    }
  };
  const accept = () =>
    run(async () => {
      if (!authenticated || !valid || !lifecycle.scope) return;
      const intentGeneration = pendingInvitationToken.generation();
      const fence = createInvitationFence(lifecycle.scope);
      try {
        const result = await acceptInvitation(token, lifecycle.scope);
        if (!mounted.current || !lifecycle.isCurrent()) return;
        if (
          !(await pendingInvitationToken.clear(
            token,
            fence.guard,
            lifecycle.isCurrent,
            intentGeneration,
          ))
        )
          return;
        if (mounted.current && lifecycle.isCurrent()) setAccepted(result);
      } catch (caught) {
        if (
          caught instanceof InvitationServiceError &&
          caught.code === 'unavailable'
        ) {
          if (!mounted.current || !lifecycle.isCurrent()) return;
          if (
            !(await pendingInvitationToken.clear(
              token,
              fence.guard,
              lifecycle.isCurrent,
              intentGeneration,
            ))
          )
            return;
          if (mounted.current && lifecycle.isCurrent()) setUnavailable(true);
        } else throw caught;
      } finally {
        fence.dispose();
      }
    });
  return (
    <ClientInvitationScreen
      state={accepted ? 'accepted' : unavailable ? 'unavailable' : 'active'}
      authenticated={authenticated}
      trainerName={accepted?.trainerName}
      loading={!ready}
      busy={busy}
      error={error ?? (storageFailed ? t('auth.sessionError') : null)}
      onSignIn={() =>
        void run(async () => {
          const storing = pendingInvitationToken.set(
            token,
            lifecycle.isCurrent,
          );
          const intentGeneration = pendingInvitationToken.generation();
          await storing;
          if (
            mounted.current &&
            lifecycle.isCurrent() &&
            pendingInvitationToken.generation() === intentGeneration
          )
            router.push('/auth/sign-in');
        })
      }
      onAccept={() => void accept()}
      onBack={() =>
        void run(async () => {
          if (!valid) {
            if (lifecycle.isCurrent())
              router.replace(authenticated ? '/auth/account' : '/auth/sign-in');
            return;
          }
          const intentGeneration = pendingInvitationToken.generation();
          const fence = lifecycle.scope
            ? createInvitationFence(lifecycle.scope)
            : null;
          try {
            if (
              !(await pendingInvitationToken.clear(
                token,
                fence?.guard,
                lifecycle.isCurrent,
                intentGeneration,
              ))
            )
              return;
          } finally {
            fence?.dispose();
          }
          if (mounted.current && lifecycle.isCurrent())
            router.replace(authenticated ? '/auth/account' : '/auth/sign-in');
        })
      }
      onContinue={() => {
        if (lifecycle.isCurrent()) router.replace('/auth/account');
      }}
      onRetry={() => {
        if (authenticated && valid && ready && !storageFailed) void accept();
        else {
          setError(null);
          setAttempt((value) => value + 1);
        }
      }}
    />
  );
}

export default function InvitationRoute() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const lifecycle = useInvitationLifecycle(token);
  if (auth.loading || auth.failed || (auth.session && !lifecycle.scope))
    return <AuthLoadingScreen />;
  return (
    <Invitation
      key={lifecycle.key}
      lifecycle={lifecycle}
      token={token}
      authenticated={Boolean(auth.session)}
    />
  );
}

import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { ClientInvitationScreen } from '@/features/invitations/screens';
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
}: {
  token: string;
  authenticated: boolean;
}) {
  const { t } = useTranslation();
  const valid = isInvitationToken(token);
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
    void pendingInvitationToken.set(token).then(
      () => {
        if (active) setStored({ attempt, failed: false });
      },
      () => {
        if (active) setStored({ attempt, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [token, valid, attempt]);
  const run = async (operation: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch {
      if (mounted.current) setError(t('auth.actionError'));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const accept = () =>
    run(async () => {
      if (!authenticated || !valid) return;
      try {
        const result = await acceptInvitation(token);
        if (!mounted.current) return;
        await pendingInvitationToken.clear(token);
        if (mounted.current) setAccepted(result);
      } catch (caught) {
        if (
          caught instanceof InvitationServiceError &&
          caught.code === 'unavailable'
        ) {
          if (!mounted.current) return;
          await pendingInvitationToken.clear(token);
          if (mounted.current) setUnavailable(true);
        } else throw caught;
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
          await pendingInvitationToken.set(token);
          if (mounted.current) router.push('/auth/sign-in');
        })
      }
      onAccept={() => void accept()}
      onBack={() =>
        void run(async () => {
          await pendingInvitationToken.clear(token);
          if (mounted.current)
            router.replace(authenticated ? '/auth/account' : '/auth/sign-in');
        })
      }
      onContinue={() => router.replace('/auth/account')}
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
  if (auth.loading || auth.failed) return <AuthLoadingScreen />;
  return (
    <Invitation
      key={`${auth.session?.user.id ?? ''}:${token}`}
      token={token}
      authenticated={Boolean(auth.session)}
    />
  );
}

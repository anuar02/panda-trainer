import { useEffect, useMemo, useRef, useState } from 'react';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { useInvitationLifecycle } from '@/features/invitations/use-invitation-lifecycle';
import { loadTrainerInvitation } from '@/features/invitations/read';
import {
  createInvitationFence,
  InvitationSessionError,
} from '@/features/invitations/session';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { TrainerInvitationScreen } from '@/features/invitations/screens';
import {
  createIssueClientInvitationOperation,
  createRevokeClientInvitationOperation,
  isInvitationBaseUrl,
  type InvitationIssueOperation,
  type InvitationRevokeOperation,
  type IssuedInvitation,
} from '@/features/invitations/service';
import type { Database } from '@/lib/database.types';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';
import { useToast } from '@/ui/toast';

type Client = Database['public']['Tables']['client_records']['Row'];
type Invitation = Pick<
  Database['public']['Tables']['invitations']['Row'],
  'id' | 'expires_at' | 'accepted_at' | 'revoked_at'
>;

function InvitationManager({
  workspaceId,
  clientId,
  lifecycle,
}: {
  workspaceId: string;
  clientId: string;
  lifecycle: ReturnType<typeof useInvitationLifecycle>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    attempt: number;
    data: { client: Client; invitation: Invitation | null } | null;
    failed: boolean;
  } | null>(null);
  const current = loaded?.attempt === attempt ? loaded : null;
  const data = current?.data;
  const loading = current === null;
  const loadFailed = current?.failed ?? false;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pending = useRef(false);
  const mounted = useRef(true);
  const issueOperation = useRef<InvitationIssueOperation | null>(null);
  const revokeOperation = useRef<{
    id: string;
    operation: InvitationRevokeOperation;
  } | null>(null);
  const scope = useMemo(
    () =>
      lifecycle.scope
        ? { ...lifecycle.scope, workspaceId, clientRecordId: clientId }
        : null,
    [lifecycle.scope, workspaceId, clientId],
  );
  const baseUrl =
    process.env.EXPO_PUBLIC_INVITATION_BASE_URL ??
    'https://trainer.narutouzumaki.kz';
  const configured = isInvitationBaseUrl(baseUrl);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      issueOperation.current?.dispose();
      revokeOperation.current?.operation.dispose();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!scope) throw new Error('Invitation data unavailable');
      const { client: person, invitation } = await loadTrainerInvitation(scope);
      if (active && lifecycle.isCurrent())
        setLoaded({
          attempt,
          data: { client: person, invitation },
          failed: false,
        });
    };
    void load().catch(() => {
      if (active && lifecycle.isCurrent())
        setLoaded({ attempt, data: null, failed: true });
    });
    return () => {
      active = false;
    };
  }, [scope, lifecycle, attempt]);
  const openClient = () =>
    router.replace({
      pathname: '/workspace/client/[id]',
      params: { id: clientId },
    });
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
  const create = () =>
    run(async () => {
      if (!configured || !scope || loading) return;
      issueOperation.current ??= await createIssueClientInvitationOperation(
        clientId,
        baseUrl,
        scope,
      );
      if (!lifecycle.isCurrent()) {
        issueOperation.current?.dispose();
        return;
      }
      const result = await issueOperation.current.execute();
      if (!mounted.current || !lifecycle.isCurrent()) return;
      issueOperation.current?.dispose();
      issueOperation.current = null;
      setIssued(result.active ? result : null);
      setAttempt((value) => value + 1);
    });
  const revoke = () =>
    run(async () => {
      const id = data?.invitation?.id;
      if (!id || !scope) return;
      if (revokeOperation.current?.id !== id)
        revokeOperation.current = {
          id,
          operation: createRevokeClientInvitationOperation(id, scope),
        };
      await revokeOperation.current.operation.execute();
      if (!mounted.current || !lifecycle.isCurrent()) return;
      revokeOperation.current?.operation.dispose();
      revokeOperation.current = null;
      issueOperation.current?.dispose();
      issueOperation.current = null;
      setIssued(null);
      setAttempt((value) => value + 1);
    });
  if (loadFailed)
    return (
      <Screen title={t('common.error')} subtitle={t('auth.actionError')}>
        <Button
          label={t('common.retry')}
          onPress={() => setAttempt((value) => value + 1)}
        />
        <Button label={t('workspaceClientDetails.back')} onPress={openClient} />
      </Screen>
    );
  const invitation = data?.invitation;
  const active = Boolean(
    invitation &&
    !invitation.accepted_at &&
    !invitation.revoked_at &&
    Date.parse(invitation.expires_at) > now,
  );
  const link =
    active && invitation?.id === issued?.invitationId
      ? (issued?.link ?? null)
      : null;
  return (
    <TrainerInvitationScreen
      state={
        data?.client.user_id
          ? 'connected'
          : !configured
            ? 'unavailable'
            : active
              ? 'active'
              : 'disconnected'
      }
      clientName={data?.client.display_name ?? ''}
      clientCreatedAt={data?.client.created_at ?? null}
      link={link}
      expiresAt={invitation?.expires_at ?? null}
      loading={loading}
      busy={busy}
      error={error}
      onBack={openClient}
      onOpenClient={openClient}
      onCreateLink={() => void create()}
      onReissueLink={() => void create()}
      onRevokeLink={() => void revoke()}
      onCopyLink={() =>
        void run(async () => {
          if (!link || !scope) return;
          const fence = createInvitationFence(scope);
          try {
            await fence.guard();
            if (!(await Clipboard.setStringAsync(link)))
              throw new Error('Clipboard unavailable');
            await fence.guard();
            if (mounted.current && lifecycle.isCurrent())
              toast(t('invitations.trainer.copied'));
          } catch {
            await fence.guard();
            throw new Error('Invitation action unavailable');
          } finally {
            fence.dispose();
          }
        })
      }
      onShareLink={() =>
        void run(async () => {
          if (!link || !scope) return;
          const fence = createInvitationFence(scope);
          try {
            await fence.guard();
            await Share.share({ message: link });
            await fence.guard();
          } catch {
            await fence.guard();
            throw new Error('Invitation action unavailable');
          } finally {
            fence.dispose();
          }
        })
      }
      onRetry={() => {
        if (issueOperation.current) void create();
        else if (revokeOperation.current) void revoke();
        else setAttempt((value) => value + 1);
      }}
    />
  );
}

export default function TrainerInvitationRoute() {
  const auth = useAuth();
  const context = useOnboardingContext();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lifecycle = useInvitationLifecycle(
    `${context.context?.workspace?.id ?? ''}:${id}`,
  );
  if (auth.loading || auth.failed || (auth.session && !lifecycle.scope))
    return <AuthLoadingScreen />;
  if (!auth.session) return <Redirect href="/auth/sign-in" />;
  if (context.loading) return <Screen title={t('common.loading')} />;
  if (context.failed)
    return (
      <Screen title={t('common.error')}>
        <Button label={t('common.retry')} onPress={context.retry} />
      </Screen>
    );
  const workspace = context.context?.workspace;
  if (!workspace) return <Redirect href="/auth/account" />;
  return (
    <InvitationManager
      key={lifecycle.key}
      lifecycle={lifecycle}
      workspaceId={workspace.id}
      clientId={id}
    />
  );
}

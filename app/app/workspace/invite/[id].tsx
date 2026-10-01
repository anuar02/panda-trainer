import { useEffect, useRef, useState } from 'react';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { getSupabaseClient } from '@/features/auth/client';
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
}: {
  workspaceId: string;
  clientId: string;
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
  const baseUrl = process.env.EXPO_PUBLIC_INVITATION_BASE_URL ?? '';
  const configured = isInvitationBaseUrl(baseUrl);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Invitation data unavailable');
      const person = await client
        .from('client_records')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('id', clientId)
        .is('archived_at', null)
        .maybeSingle();
      if (person.error || !person.data) throw new Error('Client unavailable');
      const invitations = await client
        .from('invitations')
        .select('id,expires_at,accepted_at,revoked_at')
        .eq('client_record_id', clientId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (invitations.error) throw new Error('Invitation data unavailable');
      if (active)
        setLoaded({
          attempt,
          data: { client: person.data, invitation: invitations.data },
          failed: false,
        });
    };
    void load().catch(() => {
      if (active) setLoaded({ attempt, data: null, failed: true });
    });
    return () => {
      active = false;
    };
  }, [workspaceId, clientId, attempt]);
  const openClient = () =>
    router.replace({
      pathname: '/workspace/client/[id]',
      params: { id: clientId },
    });
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
  const create = () =>
    run(async () => {
      if (!configured) return;
      issueOperation.current ??= await createIssueClientInvitationOperation(
        clientId,
        baseUrl,
      );
      const result = await issueOperation.current.execute();
      if (!mounted.current) return;
      issueOperation.current = null;
      setIssued(result.active ? result : null);
      setAttempt((value) => value + 1);
    });
  const revoke = () =>
    run(async () => {
      const id = data?.invitation?.id;
      if (!id) return;
      if (revokeOperation.current?.id !== id)
        revokeOperation.current = {
          id,
          operation: createRevokeClientInvitationOperation(id),
        };
      await revokeOperation.current.operation.execute();
      if (!mounted.current) return;
      revokeOperation.current = null;
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
          if (link && !(await Clipboard.setStringAsync(link)))
            throw new Error('Clipboard unavailable');
          if (link && mounted.current) toast(t('invitations.trainer.copied'));
        })
      }
      onShareLink={() =>
        void run(async () => {
          if (link) await Share.share({ message: link });
        })
      }
      onRetry={() => setAttempt((value) => value + 1)}
    />
  );
}

export default function TrainerInvitationRoute() {
  const auth = useAuth();
  const context = useOnboardingContext();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (auth.loading || auth.failed) return <AuthLoadingScreen />;
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
      key={`${auth.session.user.id}:${workspace.id}:${id}`}
      workspaceId={workspace.id}
      clientId={id}
    />
  );
}

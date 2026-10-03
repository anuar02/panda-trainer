import { useCallback, useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { WorkspaceClientsScreen } from '@/features/workspace-clients/clients-screen';
import {
  createWorkspaceClient,
  loadWorkspaceClients,
} from '@/features/workspace-clients/service';
import { useClientRead } from '@/features/workspace-clients/use-client-read';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';

function ClientList({
  workspaceId,
  timezone,
  userId,
  token,
}: {
  workspaceId: string;
  timezone: string;
  userId: string;
  token: string;
}) {
  const { t, i18n } = useTranslation();
  const load = useCallback(
    (signal: AbortSignal) =>
      loadWorkspaceClients(workspaceId, { userId, token, signal }),
    [workspaceId, userId, token],
  );
  const read = useClientRead(
    `${userId}:${token}:${workspaceId}`,
    userId,
    token,
    load,
  );
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const request = useRef<{ name: string; id: string } | null>(null);
  const onAdd = async (value: string) => {
    if (pending.current) throw new Error('Client creation is already pending');
    pending.current = true;
    setBusy(true);
    const name = value.trim();
    if (request.current?.name !== name)
      request.current = { name, id: randomUUID() };
    try {
      await createWorkspaceClient(name, request.current.id);
      request.current = null;
      read.retry();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const rows = (read.data ?? []).map((person) => {
    const start = person.nextStartsAt ? new Date(person.nextStartsAt) : null;
    const date = start
      ? new Intl.DateTimeFormat(i18n.language, {
          day: 'numeric',
          month: 'short',
          timeZone: timezone,
        }).format(start)
      : '';
    const time = start
      ? new Intl.DateTimeFormat(i18n.language, {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: timezone,
        }).format(start)
      : '';
    return {
      id: person.id,
      name: person.display_name,
      phone: person.phone,
      programName: person.programName,
      connected: person.user_id !== null,
      nextLabel: start
        ? t(`trainerClients.${person.nextIsGroup ? 'nextGroup' : 'next'}`, {
            date,
            time,
          })
        : null,
    };
  });
  return (
    <WorkspaceClientsScreen
      rows={rows}
      loading={read.loading}
      error={read.failed}
      busy={busy}
      onRetry={read.retry}
      onAdd={onAdd}
      onBack={() => router.replace('/auth/account')}
      onOpen={(id) =>
        router.push({ pathname: '/workspace/client/[id]', params: { id } })
      }
    />
  );
}

export default function WorkspaceClientsRoute() {
  const auth = useAuth();
  const context = useOnboardingContext();
  const { t } = useTranslation();
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
  if (!workspace) return <Redirect href="/auth/onboarding" />;
  return (
    <ClientList
      key={`${auth.session.user.id}:${workspace.id}`}
      userId={auth.session.user.id}
      token={auth.session.access_token}
      workspaceId={workspace.id}
      timezone={workspace.timezone}
    />
  );
}

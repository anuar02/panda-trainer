import { useEffect, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import {
  WorkspaceClientDetailsScreen,
  type WorkspaceClientDetailsData,
} from '@/features/workspace-clients/details-screen';
import { loadWorkspaceClientDetails } from '@/features/workspace-clients/service';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';

function ClientDetails({
  workspaceId,
  clientId,
  timezone,
}: {
  workspaceId: string;
  clientId: string;
  timezone: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    attempt: number;
    data: WorkspaceClientDetailsData | null;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void loadWorkspaceClientDetails(workspaceId, clientId).then(
      (data) => {
        if (active) setLoaded({ attempt, data, failed: false });
      },
      () => {
        if (active) setLoaded({ attempt, data: null, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, clientId, workspaceId]);
  const current = loaded?.attempt === attempt ? loaded : null;
  return (
    <WorkspaceClientDetailsScreen
      data={current?.data ?? null}
      timezone={timezone}
      loading={!current}
      error={current?.failed ?? false}
      onRetry={() => setAttempt((value) => value + 1)}
      onBack={() => router.replace('/workspace/clients')}
      onInvite={() =>
        router.push({
          pathname: '/workspace/invite/[id]',
          params: { id: clientId },
        })
      }
    />
  );
}

export default function WorkspaceClientDetailsRoute() {
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
  if (!workspace) return <Redirect href="/auth/onboarding" />;
  return (
    <ClientDetails
      key={`${auth.session.user.id}:${workspace.id}:${id}`}
      workspaceId={workspace.id}
      clientId={id}
      timezone={workspace.timezone}
    />
  );
}

import { useCallback } from 'react';
import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { WorkspaceClientDetailsScreen } from '@/features/workspace-clients/details-screen';
import { loadWorkspaceClientDetails } from '@/features/workspace-clients/service';
import { useClientRead } from '@/features/workspace-clients/use-client-read';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';
import { useClientProgramAssignment } from '@/features/workspace-programs/use-assignment';
import { ClientFinancialMetrics } from '@/features/trainer-billing/client-financial-metrics';
import { ClientPurchaseControls } from '@/features/trainer-billing/client-purchase-controls';
import { WorkspaceMutationBoundary } from '@/features/workspace-scheduling/mutation-provider';

function ClientDetails({
  workspaceId,
  clientId,
  userId,
  token,
  timezone,
  initialTab,
}: {
  workspaceId: string;
  clientId: string;
  userId: string;
  token: string;
  timezone: string;
  initialTab: 'sessions' | 'program' | 'progress' | 'billing' | 'notes';
}) {
  const load = useCallback(
    (signal: AbortSignal) =>
      loadWorkspaceClientDetails(workspaceId, clientId, {
        userId,
        token,
        signal,
      }),
    [workspaceId, clientId, userId, token],
  );
  const read = useClientRead(
    `${userId}:${token}:${workspaceId}:${clientId}`,
    userId,
    token,
    load,
  );
  const assignment = useClientProgramAssignment({
    userId,
    workspaceId,
    clientRecordId: clientId,
  });
  const reloadAssignment = assignment.reload;
  useFocusEffect(
    useCallback(() => {
      reloadAssignment();
    }, [reloadAssignment]),
  );
  return (
    <WorkspaceClientDetailsScreen
      data={read.data ?? null}
      timezone={timezone}
      loading={read.loading}
      error={read.failed}
      onRetry={read.retry}
      onBack={() => router.replace('/workspace/clients')}
      initialTab={initialTab}
      financialContent={
        <ClientFinancialMetrics
          userId={userId}
          workspaceId={workspaceId}
          clientRecordId={clientId}
          timezone={timezone}
        />
      }
      billingContent={
        <ClientPurchaseControls
          userId={userId}
          workspaceId={workspaceId}
          clientRecordId={clientId}
          clientName={read.data?.client.display_name ?? ''}
          timezone={timezone}
        />
      }
      assignmentPending={assignment.pending !== null}
      assignmentLoading={assignment.loading}
      assignmentReadError={
        assignment.error === 'storage' || assignment.error === 'invalidPending'
      }
      onRetryAssignmentRead={assignment.reload}
      onAssignProgram={() => {
        if (assignment.pending) {
          router.push({
            pathname: '/workspace/library/template/[id]',
            params: { id: assignment.pending.templateId, clientId },
          });
        } else {
          router.push({
            pathname: '/workspace/library',
            params: { clientId, tab: 'templates' },
          });
        }
      }}
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
  const { id, tab, refresh } = useLocalSearchParams<{
    id: string;
    tab?: string;
    refresh?: string;
  }>();
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
    <WorkspaceMutationBoundary
      userId={auth.session.user.id}
      workspaceId={workspace.id}
    >
      <ClientDetails
        key={`${auth.session.user.id}:${workspace.id}:${id}:${refresh ?? ''}`}
        workspaceId={workspace.id}
        clientId={id}
        userId={auth.session.user.id}
        token={auth.session.access_token}
        timezone={workspace.timezone}
        initialTab={tab === 'program' || tab === 'billing' ? tab : 'sessions'}
      />
    </WorkspaceMutationBoundary>
  );
}

import { useCallback, useEffect, useState } from 'react';
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
import {
  WorkspaceClientDetailsScreen,
  type WorkspaceClientDetailsData,
} from '@/features/workspace-clients/details-screen';
import { loadWorkspaceClientDetails } from '@/features/workspace-clients/service';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';
import { useClientProgramAssignment } from '@/features/workspace-programs/use-assignment';
import { ClientPurchaseControls } from '@/features/trainer-billing/client-purchase-controls';
import { WorkspaceMutationBoundary } from '@/features/workspace-scheduling/mutation-provider';

function ClientDetails({
  workspaceId,
  clientId,
  userId,
  timezone,
  initialTab,
}: {
  workspaceId: string;
  clientId: string;
  userId: string;
  timezone: string;
  initialTab: 'sessions' | 'program' | 'progress' | 'billing' | 'notes';
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
  const current = loaded?.attempt === attempt ? loaded : null;
  return (
    <WorkspaceClientDetailsScreen
      data={current?.data ?? null}
      timezone={timezone}
      loading={!current}
      error={current?.failed ?? false}
      onRetry={() => setAttempt((value) => value + 1)}
      onBack={() => router.replace('/workspace/clients')}
      initialTab={initialTab}
      billingContent={
        <ClientPurchaseControls
          userId={userId}
          workspaceId={workspaceId}
          clientRecordId={clientId}
          clientName={current?.data?.client.display_name ?? ''}
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
        timezone={workspace.timezone}
        initialTab={tab === 'program' || tab === 'billing' ? tab : 'sessions'}
      />
    </WorkspaceMutationBoundary>
  );
}

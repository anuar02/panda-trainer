import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { WorkspaceScheduleScreen } from '@/features/workspace-scheduling/workspace-schedule-screen';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';

export default function WorkspaceScheduleRoute() {
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
  if (!workspace) return <Redirect href="/auth/account" />;
  return (
    <WorkspaceScheduleScreen
      key={`${auth.session.user.id}:${workspace.id}`}
      userId={auth.session.user.id}
      workspaceId={workspace.id}
      timezone={workspace.timezone}
    />
  );
}

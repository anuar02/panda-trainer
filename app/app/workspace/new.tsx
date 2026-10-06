import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { WorkspaceCreateSessionScreen } from '@/features/workspace-scheduling/workspace-create-session-screen';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';
export default function WorkspaceCreateSessionRoute() {
  const auth = useAuth();
  const context = useOnboardingContext();
  const { date, start } = useLocalSearchParams<{
    date?: string;
    start?: string;
  }>();
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
    <WorkspaceCreateSessionScreen
      userId={auth.session.user.id}
      workspaceId={workspace.id}
      timezone={workspace.timezone}
      initialDate={date}
      initialStart={start}
      onClose={() =>
        router.replace({
          pathname: '/workspace/schedule',
          params: date ? { date } : {},
        })
      }
      onCreated={(createdDate) =>
        router.replace({
          pathname: '/workspace/schedule',
          params: { date: createdDate },
        })
      }
    />
  );
}

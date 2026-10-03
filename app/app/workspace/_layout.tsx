import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { WorkspaceMutationProvider } from '@/features/workspace-scheduling/mutation-provider';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { useTheme } from '@/ui/theme';

export default function WorkspaceLayout() {
  const auth = useAuth();
  const context = useOnboardingContext();
  const { t } = useTranslation();
  const { colors } = useTheme();
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
    <WorkspaceMutationProvider
      userId={auth.session.user.id}
      workspaceId={workspace.id}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      />
    </WorkspaceMutationProvider>
  );
}

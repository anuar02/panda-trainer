import { WorkoutPreloadOfflineRecovery } from '@/features/workout-preload/offline-recovery';
import { View } from 'react-native';
import { WorkoutPreloadProvider } from '@/features/workout-preload/provider';
import { WorkoutPreloadDock } from '@/features/workout-preload/dock';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/provider';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { WorkspaceMutationProvider } from '@/features/workspace-scheduling/mutation-provider';
import { useTheme } from '@/ui/theme';

export default function WorkspaceLayout() {
  const auth = useAuth();
  const context = useOnboardingContext();
  const { colors } = useTheme();
  if (auth.loading || auth.failed) return <AuthLoadingScreen />;
  if (!auth.session) return <Redirect href="/auth/sign-in" />;
  if (context.loading)
    return (
      <WorkoutPreloadOfflineRecovery pending onRetry={context.retry}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.canvas },
          }}
        />
      </WorkoutPreloadOfflineRecovery>
    );
  if (context.failed)
    return (
      <WorkoutPreloadOfflineRecovery onRetry={context.retry}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.canvas },
          }}
        />
      </WorkoutPreloadOfflineRecovery>
    );
  const workspace = context.context?.workspace;
  if (!workspace) return <Redirect href="/auth/onboarding" />;
  return (
    <WorkspaceMutationProvider
      userId={auth.session.user.id}
      workspaceId={workspace.id}
    >
      <WorkoutPreloadProvider
        key={`${auth.session.user.id}:${workspace.id}`}
        workspaceId={workspace.id}
      >
        <View className="flex-1">
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.canvas },
            }}
          />
          <WorkoutPreloadDock />
        </View>
      </WorkoutPreloadProvider>
    </WorkspaceMutationProvider>
  );
}

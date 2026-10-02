import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { ClientScheduleScreen } from '@/features/client-scheduling/client-schedule-screen';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';

export default function ClientConnectionRoute() {
  const { clientRecordId } = useLocalSearchParams<{ clientRecordId: string }>();
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
  const connection = context.context?.connections.find(
    (value) => value.client_record_id === clientRecordId,
  );
  if (!connection) return <Redirect href="/auth/account" />;
  return (
    <ClientScheduleScreen
      userId={auth.session.user.id}
      workspaceId={connection.workspace_id}
      clientRecordId={connection.client_record_id}
      clientName={connection.client_name}
      trainerName={connection.trainer_name}
    />
  );
}

import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';

export function ClientEntryRoute({
  page,
}: {
  page: 'home' | 'history' | 'progress' | 'program';
}) {
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
  const connections = context.context?.connections;
  const connection = connections?.length === 1 ? connections[0] : null;
  if (!connection) return <Redirect href="/auth/account" />;
  const pathname =
    page === 'home'
      ? '/connection/[clientRecordId]'
      : page === 'history'
        ? '/connection/[clientRecordId]/history'
        : page === 'progress'
          ? '/connection/[clientRecordId]/progress'
          : '/connection/[clientRecordId]/program';
  return (
    <Redirect
      href={{
        pathname,
        params: { clientRecordId: connection.client_record_id },
      }}
    />
  );
}

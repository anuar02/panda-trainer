import { useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/ui/screen';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { Button } from '@/ui/button';
import { useAuth } from '@/features/auth/provider';
import { authService } from '@/features/auth/service';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { usePendingInvitation } from '@/features/invitations/use-pending-invitation';

export default function AccountRoute() {
  const auth = useAuth();
  const context = useOnboardingContext();
  const invitation = usePendingInvitation(auth.session?.user.id);
  const { t } = useTranslation();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const leave = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await authService.signOut();
      router.replace('/auth/sign-in');
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  if (auth.loading || auth.failed) return <AuthLoadingScreen />;
  if (!auth.session) return <Redirect href="/auth/sign-in" />;
  if (invitation.loading) return <Screen title={t('common.loading')} />;
  if (invitation.failed)
    return (
      <Screen title={t('common.error')} subtitle={t('auth.sessionError')}>
        <Button label={t('common.retry')} onPress={invitation.retry} />
      </Screen>
    );
  if (invitation.token)
    return (
      <Redirect
        href={{
          pathname: '/invite/[token]',
          params: { token: invitation.token },
        }}
      />
    );
  if (context.loading) return <Screen title={t('common.loading')} />;
  if (
    !context.failed &&
    !context.context?.workspace &&
    !context.context?.connections.length
  )
    return <Redirect href="/auth/onboarding" />;
  return (
    <Screen title={t('auth.accountTitle')} subtitle={t('auth.accountSubtitle')}>
      <Card>
        <Text>{auth.session.user.email}</Text>
        {context.failed ? (
          <Button label={t('common.retry')} onPress={context.retry} />
        ) : (
          <>
            <Text>{context.context?.profile?.display_name}</Text>
            {context.context?.workspace ? (
              <>
                <Text className="text-secondary">
                  {t('auth.workspaceReady', {
                    name: context.context?.workspace?.name ?? '',
                  })}
                </Text>
                <Button
                  label={t('auth.openClients')}
                  disabled={busy}
                  onPress={() => router.push('/workspace/clients')}
                />
                <Button
                  label={t('workspaceLibrary.open')}
                  disabled={busy}
                  onPress={() => router.push('/workspace/library')}
                />
                <Button
                  label={t('workspaceScheduling.openToday')}
                  disabled={busy}
                  onPress={() => router.push('/workspace/today')}
                />
                <Button
                  label={t('workspaceScheduling.open')}
                  disabled={busy}
                  onPress={() => router.push('/workspace/schedule')}
                />
              </>
            ) : null}
            {context.context?.connections.map((connection) => (
              <Card key={connection.client_record_id}>
                <Text>
                  {t('auth.connectedTrainer', {
                    name: connection.trainer_name,
                  })}
                </Text>
                <Text className="text-secondary">{connection.client_name}</Text>
                <Button
                  label={t('workspaceScheduling.openClientHome')}
                  disabled={busy}
                  onPress={() =>
                    router.push({
                      pathname: '/connection/[clientRecordId]',
                      params: { clientRecordId: connection.client_record_id },
                    })
                  }
                />
              </Card>
            ))}
          </>
        )}
        {failed ? (
          <Text accessibilityRole="alert">{t('auth.actionError')}</Text>
        ) : null}
        <Button
          label={t('auth.signOut')}
          loading={busy}
          onPress={() => void leave()}
        />
        <Button
          label={t('auth.switchAccount')}
          variant="secondary"
          disabled={busy}
          onPress={() => void leave()}
        />
        <Button
          label={t('auth.demo')}
          variant="ghost"
          disabled={busy}
          onPress={() => router.push('/demo')}
        />
      </Card>
    </Screen>
  );
}

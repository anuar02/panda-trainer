import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { authService } from '@/features/auth/service';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { completeTrainerOnboarding } from '@/features/onboarding/service';
import { WelcomeScreen } from '@/features/onboarding/welcome-screen';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';

export default function OnboardingRoute() {
  const auth = useAuth();
  const context = useOnboardingContext();
  const { t } = useTranslation();
  const [invitation, setInvitation] = useState(false);
  const [completedUser, setCompletedUser] = useState<string | null>(null);
  const [leaveFailed, setLeaveFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (auth.loading || auth.failed) return <AuthLoadingScreen />;
  if (!auth.session) return <Redirect href="/auth/sign-in" />;
  if (context.loading) return <Screen title={t('common.loading')} />;
  if (context.failed)
    return (
      <Screen title={t('common.error')}>
        <Button label={t('common.retry')} onPress={context.retry} />
      </Screen>
    );
  if (context.context?.workspace && completedUser !== auth.session.user.id)
    return <Redirect href="/auth/account" />;
  if (invitation)
    return (
      <Screen
        title={t('auth.inviteNeeded')}
        subtitle={
          leaveFailed ? t('auth.actionError') : t('auth.inviteNeededHint')
        }
      >
        <Button
          label={t('auth.backToSetup')}
          onPress={() => setInvitation(false)}
          disabled={leaving}
        />
        <Button
          label={t('auth.switchAccount')}
          variant="secondary"
          loading={leaving}
          onPress={() => {
            setLeaving(true);
            setLeaveFailed(false);
            void authService
              .signOut()
              .then(
                () => router.replace('/auth/sign-in'),
                () => setLeaveFailed(true),
              )
              .finally(() => setLeaving(false));
          }}
        />
      </Screen>
    );
  return (
    <WelcomeScreen
      key={auth.session.user.id}
      initialName={context.context?.profile?.display_name ?? ''}
      onComplete={async (draft) => {
        const result = await completeTrainerOnboarding(draft);
        setCompletedUser(result.userId);
      }}
      onClientInvitation={() => setInvitation(true)}
      canSchedule={false}
      onScheduleFirstSession={() => {}}
      onOpenClients={() => router.replace('/workspace/clients')}
    />
  );
}

import { useEffect, useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { authService } from '@/features/auth/service';
import { AuthLoadingScreen } from '@/features/auth/loading-screen';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { type OnboardingContext } from '@/features/onboarding/service';
import { onboardingFailure } from '@/features/onboarding/session';
import { focusCodes } from '@/features/onboarding/validation';
import { WelcomeScreen } from '@/features/onboarding/welcome-screen';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';

function Setup({
  context,
}: {
  context: ReturnType<typeof useOnboardingContext>;
}) {
  const { t } = useTranslation();
  const [invitation, setInvitation] = useState(false);
  const [completed, setCompleted] = useState<OnboardingContext | null>(null);
  const [leaveFailed, setLeaveFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const mounted = useRef(true);
  const submit = useRef<object | null>(null);
  const leave = useRef<object | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      submit.current = null;
      leave.current = null;
    };
  }, []);
  const current = () => mounted.current && context.isCurrent();
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
          onPress={() => {
            if (current()) setInvitation(false);
          }}
          disabled={leaving}
        />
        <Button
          label={t('auth.switchAccount')}
          variant="secondary"
          loading={leaving}
          onPress={() => {
            if (!current() || leave.current) return;
            const generation = {};
            leave.current = generation;
            setLeaving(true);
            setLeaveFailed(false);
            void authService
              .signOut()
              .then(
                () => {
                  if (current() && leave.current === generation)
                    router.replace('/auth/sign-in');
                },
                () => {
                  if (current() && leave.current === generation)
                    setLeaveFailed(true);
                },
              )
              .finally(() => {
                if (current() && leave.current === generation) {
                  leave.current = null;
                  setLeaving(false);
                }
              });
          }}
        />
      </Screen>
    );
  return (
    <WelcomeScreen
      initialName={context.context?.profile?.display_name ?? ''}
      onComplete={async (draft) => {
        if (!current() || submit.current) throw onboardingFailure();
        const generation = {};
        submit.current = generation;
        try {
          const result = await context.complete(draft);
          if (!current() || submit.current !== generation)
            throw onboardingFailure();
          setCompleted(result);
          const workspace = result.workspace;
          if (!workspace || !result.profile) throw onboardingFailure();
          return {
            ...draft,
            name: result.profile.display_name,
            focus: Object.keys(focusCodes).filter((label) =>
              workspace.training_focus.includes(focusCodes[label]!),
            ),
            days: workspace.working_days,
            from: workspace.day_start.slice(0, 5),
            to: workspace.day_end.slice(0, 5),
            length: workspace.usual_session_minutes,
          };
        } finally {
          if (current() && submit.current === generation) submit.current = null;
        }
      }}
      onClientInvitation={() => {
        if (current()) setInvitation(true);
      }}
      canSchedule={false}
      onScheduleFirstSession={() => {}}
      onOpenClients={() => {
        if (
          current() &&
          completed?.workspace &&
          completed.userId === context.context?.userId
        )
          router.replace('/workspace/clients');
      }}
    />
  );
}

export default function OnboardingRoute() {
  const auth = useAuth();
  const context = useOnboardingContext();
  const { t } = useTranslation();
  if (auth.loading || auth.failed) return <AuthLoadingScreen />;
  if (!auth.session) return <Redirect href="/auth/sign-in" />;
  if (context.loading) return <Screen title={t('common.loading')} />;
  if (context.failed || !context.context)
    return (
      <Screen title={t('common.error')}>
        <Button label={t('common.retry')} onPress={context.retry} />
      </Screen>
    );
  if (context.context.workspace || context.context.connections.length)
    return <Redirect href="/auth/account" />;
  return <Setup key={context.generation} context={context} />;
}

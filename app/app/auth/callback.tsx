import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { Button } from '@/ui/button';
import { useAuth } from '@/features/auth/provider';
import { authService } from '@/features/auth/service';

export default function AuthCallbackRoute() {
  const url = Linking.useURL();
  const auth = useAuth();
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!url) return;
    let active = true;
    void authService.completeOAuthCallback(url).then(
      (session) => {
        if (active && !session) setFailed(true);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [url]);
  if (auth.session) return <Redirect href="/auth/account" />;
  return (
    <Screen title={t('auth.restoring')}>
      {failed ? (
        <>
          <Text accessibilityRole="alert">{t('auth.callbackError')}</Text>
          <Button
            label={t('auth.retry')}
            onPress={() => router.replace('/auth/sign-in')}
          />
        </>
      ) : (
        <ActivityIndicator accessibilityLabel={t('auth.restoring')} />
      )}
    </Screen>
  );
}

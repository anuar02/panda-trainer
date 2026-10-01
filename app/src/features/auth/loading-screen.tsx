import { ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { Button } from '@/ui/button';
import { useAuth } from './provider';

export function AuthLoadingScreen() {
  const { t } = useTranslation();
  const auth = useAuth();
  return (
    <Screen title={t('auth.restoring')}>
      {auth.failed ? (
        <>
          <Text accessibilityRole="alert">{t('auth.sessionError')}</Text>
          <Button label={t('auth.retry')} onPress={auth.retry} />
        </>
      ) : (
        <ActivityIndicator accessibilityLabel={t('auth.restoring')} />
      )}
    </Screen>
  );
}

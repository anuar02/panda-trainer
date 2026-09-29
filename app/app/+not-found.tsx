import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Screen title={t('common.notFound')}>
      <Button label={t('common.home')} onPress={() => router.replace('/')} />
    </Screen>
  );
}

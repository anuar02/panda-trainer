import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Screen } from '@/ui/screen';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { Button } from '@/ui/button';
export default function DemoScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('auth.demoTitle')} subtitle={t('auth.demoHint')}>
      <Card>
        <Text className="font-heading text-xl">{t('common.trainer')}</Text>
        <Text className="text-secondary">{t('common.trainerHint')}</Text>
        <Button
          label={t('common.trainer')}
          onPress={() => router.replace('/(trainer)/today')}
        />
      </Card>
      <Card>
        <Text className="font-heading text-xl">{t('common.client')}</Text>
        <Text className="text-secondary">{t('common.clientHint')}</Text>
        <Button
          label={t('common.client')}
          variant="secondary"
          onPress={() => router.replace('/(client)/home')}
        />
      </Card>
    </Screen>
  );
}

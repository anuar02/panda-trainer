import type { PropsWithChildren } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import { useOptionalTemplates } from './provider';
export function TemplateStorageGate({ children }: PropsWithChildren) {
  const store = useOptionalTemplates();
  const { t } = useTranslation();
  if (store?.readError)
    return (
      <View>
        <Text accessibilityRole="alert">{t('templateEditor.readError')}</Text>
        <Button label={t('templateEditor.retry')} onPress={store.retry} />
      </View>
    );
  if (store && !store.ready)
    return (
      <ActivityIndicator accessibilityLabel={t('templateEditor.saving')} />
    );
  return children;
}

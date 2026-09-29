import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './text';
import { Button } from './button';
import { useTheme } from './theme';
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View className="gap-3 py-section">
      <Text className="font-heading text-xl leading-7">{title}</Text>
      <Text className="text-secondary">{description}</Text>
    </View>
  );
}
export function LoadingState() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View accessibilityState={{ busy: true }} className="gap-4 py-section">
      <ActivityIndicator color={colors.accent} />
      <Text className="text-center text-secondary">{t('common.loading')}</Text>
    </View>
  );
}
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View accessibilityRole="alert" className="gap-4">
      <EmptyState
        title={t('common.error')}
        description={t('common.errorHint')}
      />
      <Button label={t('common.retry')} onPress={onRetry} />
    </View>
  );
}
export function OfflineState() {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="alert"
      className="gap-2 rounded-card border border-control bg-sunken p-page"
    >
      <Text className="font-strong">{t('common.offline')}</Text>
      <Text className="text-secondary">{t('common.offlineHint')}</Text>
    </View>
  );
}

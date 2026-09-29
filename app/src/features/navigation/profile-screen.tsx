import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Screen } from '@/ui/screen';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { useTheme } from '@/ui/theme';
export function ProfileScreen({ role }: { role: 'trainer' | 'client' }) {
  const { t } = useTranslation();
  const { appearance, setAppearance } = useTheme();
  return (
    <Screen title={t('tabs.profile')} subtitle={t('profile.description')}>
      <Card>
        <Text className="text-secondary">{t('profile.role')}</Text>
        <Text className="font-heading text-xl">{t(`common.${role}`)}</Text>
      </Card>
      <Card>
        <Text className="font-strong">{t('profile.appearance')}</Text>
        <View className="flex-row flex-wrap gap-2">
          {(['auto', 'dark', 'light'] as const).map((value) => (
            <Chip
              key={value}
              label={t(`profile.${value}`)}
              selected={appearance === value}
              onPress={() => setAppearance(value)}
            />
          ))}
        </View>
      </Card>
      <Button
        label={t('common.backToRoles')}
        variant="secondary"
        onPress={() => router.replace('/')}
      />
    </Screen>
  );
}

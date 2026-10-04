import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { Icon } from '@/ui/icons';
import { Card } from '@/ui/card';
import { useTheme } from '@/ui/theme';
export function DemoNotificationEntry() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('notifications.title')}
        onPress={() => setOpen(true)}
        className="min-h-touch min-w-touch items-center justify-center rounded-xl bg-sunken"
      >
        <Icon name="bell" color={colors.ink} size={22} />
      </Pressable>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('notifications.title')}
      >
        <Text>{t('notifications.demo')}</Text>
        <Card>
          <Text>{t('notifications.booking_confirmed')}</Text>
          <Text>{t('notifications.workout_finished')}</Text>
        </Card>
      </Sheet>
    </>
  );
}

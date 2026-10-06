import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '@/ui/text';
import { Button } from '@/ui/button';
import { LoadingState } from '@/ui/states';
import { usePushOpen } from '@/features/push/use-push-open';
export default function PushOpen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const open = usePushOpen(params.notificationId, params.workspaceId);
  useEffect(() => {
    const target = open.destination;
    if (!target || target.cancelled) return;
    if (target.role === 'client')
      router.replace({
        pathname: '/connection/[clientRecordId]',
        params: {
          clientRecordId: target.clientRecordId,
          booking: target.bookingId,
        },
      });
    else
      router.replace({
        pathname: '/workspace/schedule',
        params: { date: target.date },
      });
  }, [open.destination, router]);
  return (
    <SafeAreaView className="flex-1 gap-4 bg-canvas p-page">
      {open.loading ? (
        <LoadingState />
      ) : open.signIn ? (
        <>
          <Text>{t('push.signIn')}</Text>
          <Button
            label={t('push.signIn')}
            onPress={() => router.push('/auth/sign-in')}
          />
        </>
      ) : open.failed ? (
        <Text accessibilityRole="alert">{t('common.error')}</Text>
      ) : (
        <Text accessibilityRole="alert">{t('notifications.unavailable')}</Text>
      )}
    </SafeAreaView>
  );
}

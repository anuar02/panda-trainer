import { useLayoutEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Card } from '@/ui/card';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import { ErrorState, LoadingState } from '@/ui/states';
import type { NotificationRow } from '@/domain/notifications';
import {
  useNotifications,
  type NotificationContext,
} from './use-notifications';

const kindIcon = (row: NotificationRow): IconName =>
  row.kind.includes('reschedul')
    ? 'swap'
    : row.kind === 'booking_cancelled'
      ? 'ban'
      : row.target_type === 'workout'
        ? 'dumbbell'
        : 'check';
export function NotificationEntry(
  context: NotificationContext & { variant?: 'icon' | 'row' },
) {
  const feed = useNotifications(context);
  return (
    <NotificationFeedContent
      key={feed.scopeKey}
      context={context}
      feed={feed}
    />
  );
}
function NotificationFeedContent({
  context,
  feed,
}: {
  context: NotificationContext & { variant?: 'icon' | 'row' };
  feed: ReturnType<typeof useNotifications>;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [targetError, setTargetError] = useState(false);
  const [targetBusy, setTargetBusy] = useState(false);
  const lifetime = useRef({ turn: 0, live: true });
  useLayoutEffect(() => {
    const owner = lifetime.current;
    owner.live = true;
    return () => {
      owner.live = false;
      ++owner.turn;
    };
  }, []);
  const countLabel =
    feed.unreadCount === null
      ? t('notifications.unknown')
      : t('notifications.unread', { count: feed.unreadCount });
  const close = () => {
    ++lifetime.current.turn;
    setOpen(false);
    setTargetBusy(false);
  };
  const navigate = async (row: NotificationRow) => {
    const turn = ++lifetime.current.turn;
    setTargetBusy(true);
    setTargetError(false);
    setUnavailable(false);
    try {
      const target = await feed.target(row.id);
      if (!lifetime.current.live || turn !== lifetime.current.turn || !target)
        return;
      if (
        target.id !== row.target_id ||
        target.type !== row.target_type ||
        target.clientRecordId !== row.client_record_id
      )
        throw new Error('Notification target changed');
      if (!target.available) {
        setUnavailable(true);
        return;
      }
      if (target.current?.status.startsWith('cancelled')) {
        setCancelled(true);
        return;
      }
      close();
      if (context.role === 'client') {
        router.push({
          pathname:
            target.type === 'workout'
              ? '/connection/[clientRecordId]/history'
              : '/connection/[clientRecordId]',
          params: {
            clientRecordId: target.clientRecordId,
            ...(target.type === 'workout'
              ? { workout: target.id }
              : { booking: target.id }),
          },
        });
      } else {
        router.push({
          pathname:
            target.type === 'booking'
              ? '/workspace/schedule'
              : '/workspace/client/[id]',
          params: {
            id: target.clientRecordId,
            tab: 'sessions',
            date: target.current?.date,
            session: target.id,
          },
        });
      }
    } catch {
      if (lifetime.current.live && turn === lifetime.current.turn)
        setTargetError(true);
    } finally {
      if (lifetime.current.live && turn === lifetime.current.turn)
        setTargetBusy(false);
    }
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('notifications.title')}. ${countLabel}`}
        onPress={() => {
          setOpen(true);
          setUnavailable(false);
          setTargetError(false);
        }}
        className={
          context.variant === 'row'
            ? 'min-h-touch flex-row items-center gap-3 p-[18px]'
            : 'min-h-touch min-w-touch items-center justify-center rounded-xl bg-sunken'
        }
      >
        <Icon name="bell" size={22} color={colors.ink} />
        {context.variant === 'row' && (
          <Text className="flex-1 font-strong">{t('notifications.title')}</Text>
        )}
        {feed.unreadCount !== null && feed.unreadCount > 0 && (
          <Text
            className="text-xs font-bold text-accent"
            testID="notification-count"
          >
            {feed.unreadCount}
          </Text>
        )}
        {feed.failed && (
          <Text className="text-xs text-danger">
            {t('notifications.errorIndicator')}
          </Text>
        )}
      </Pressable>
      <Sheet open={open} title={t('notifications.title')} onClose={close}>
        <Text className="text-secondary">
          {t(
            context.role === 'client'
              ? 'notifications.clientSubtitle'
              : 'notifications.trainerSubtitle',
          )}
        </Text>
        <Text accessibilityLiveRegion="polite">{countLabel}</Text>
        {feed.loading && <LoadingState />}
        {feed.failed && <ErrorState onRetry={feed.retry} />}
        {unavailable && (
          <Text accessibilityRole="alert">
            {t('notifications.unavailable')}
          </Text>
        )}
        {cancelled && (
          <Text accessibilityRole="alert">
            {`${t('notifications.booking_cancelled')}. ${t('notifications.stale')}`}
          </Text>
        )}
        {targetError && (
          <Text accessibilityRole="alert">{t('common.error')}</Text>
        )}
        {!feed.loading && !feed.failed && feed.rows.length === 0 && (
          <View className="flex-row gap-3 rounded-card bg-sunken p-page">
            <Icon name="bell" color={colors.secondary} />
            <Text className="flex-1 text-secondary">
              {t(
                context.role === 'client'
                  ? 'notifications.clientEmpty'
                  : 'notifications.trainerEmpty',
              )}
            </Text>
          </View>
        )}
        {feed.rows.length > 0 && (
          <Card flush>
            {feed.rows.map((row, index) => (
              <View
                key={row.id}
                className={`gap-2 p-[18px] ${index ? 'border-t border-control' : ''}`}
              >
                <View className="flex-row items-center gap-3">
                  {context.role === 'trainer' && (
                    <Icon
                      name={kindIcon(row)}
                      size={20}
                      color={colors.accent}
                    />
                  )}
                  <View className="flex-1 gap-1">
                    <Text className="font-strong">
                      {t(`notifications.${row.kind}`)}
                    </Text>
                    <Text className="text-xs text-secondary">
                      {new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(row.created_at))}
                    </Text>
                  </View>
                  <Icon name="chevR" size={18} color={colors.secondary} />
                </View>
                <Button
                  label={t('notifications.open')}
                  variant="ghost"
                  compact
                  disabled={targetBusy}
                  onPress={() => void navigate(row)}
                />
                {row.read_at ? (
                  <Text className="text-xs text-secondary">
                    {t('notifications.read')}
                  </Text>
                ) : (
                  <Button
                    label={t('notifications.mark')}
                    variant="soft"
                    compact
                    disabled={feed.busy || feed.loading}
                    onPress={() => void feed.mark(row.id)}
                  />
                )}
              </View>
            ))}
          </Card>
        )}
        {feed.hasMore && (
          <Button
            label={t('notifications.more')}
            variant="soft"
            disabled={feed.loading || feed.busy}
            onPress={feed.more}
          />
        )}
        <Text className="text-xs text-secondary">
          {t('notifications.stale')}
        </Text>
      </Sheet>
    </>
  );
}

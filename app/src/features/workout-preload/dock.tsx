import { Pressable, View, useWindowDimensions } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '@/ui/text';
import { Icon } from '@/ui/icons';
import { useOptionalWorkoutPreload } from './provider';

export function WorkoutPreloadDock() {
  const preload = useOptionalWorkoutPreload();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const { t } = useTranslation();
  const { context, recovery, error, status } = preload?.state ?? {};
  if (
    !preload ||
    !context ||
    !recovery ||
    pathname === '/workspace/journal' ||
    !pathname.startsWith('/workspace/') ||
    status === 'hydrating'
  )
    return null;
  const participant = context.participants.find(
    (value) => value.clientRecordId === recovery.clientRecordId,
  );
  if (!participant) return null;
  return (
    <View
      className="bg-canvas px-page"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      <Pressable
        testID="workout-preload-dock"
        accessibilityRole="button"
        accessibilityLabel={t('workoutPreload.resume')}
        onPress={() => void preload.resume()}
        style={{
          borderRadius: 22,
          minHeight: 64,
          paddingVertical: 10,
          paddingHorizontal: 12,
          backgroundColor: '#18191d',
          flexDirection: 'row',
          flexWrap: fontScale > 1.3 ? 'wrap' : 'nowrap',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Icon name="play" size={16} color="#f2f2f3" />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            numberOfLines={fontScale > 1.3 ? undefined : 1}
            style={{
              color: '#f2f2f3',
              fontFamily: 'Inter_700Bold',
              fontSize: 15,
              lineHeight: 19.5,
            }}
          >
            {participant.clientName}
          </Text>
          <Text
            numberOfLines={fontScale > 1.3 ? undefined : 1}
            style={{ color: '#f2f2f3', fontSize: 13, lineHeight: 17.55 }}
          >
            {error ? t(`workoutPreload.${error}`) : participant.programName}
          </Text>
        </View>
        <Text style={{ color: '#f2f2f3', fontSize: 13 }}>
          {t('workoutPreload.resume')}
        </Text>
      </Pressable>
    </View>
  );
}

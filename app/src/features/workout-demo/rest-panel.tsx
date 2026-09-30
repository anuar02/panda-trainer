import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useWorkoutRuntime } from './runtime';

export function WorkoutRestPanel({
  sessionId,
  clientId,
}: {
  sessionId: string;
  clientId: string;
}) {
  const { rest, adjustRest, skipRest } = useWorkoutRuntime(sessionId, clientId);
  const { t } = useTranslation();
  if (!rest) return null;
  const buttonStyle = {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#151619',
    alignItems: 'center',
    justifyContent: 'center',
  } as const;
  const textStyle = {
    color: '#8c9eff',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  };
  return (
    <View
      testID="workout-rest"
      style={{
        marginTop: 6,
        marginHorizontal: 12,
        marginBottom: 8,
        borderRadius: 16,
        backgroundColor: rest.done
          ? 'rgba(61,220,151,0.13)'
          : 'rgba(111,134,255,0.16)',
        overflow: 'hidden',
      }}
    >
      {!rest.done && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: `${Math.max(0, Math.min(100, 100 - (rest.left / rest.total) * 100))}%`,
            backgroundColor: 'rgba(111,134,255,0.16)',
          }}
        />
      )}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          padding: 6,
          paddingLeft: 12,
        }}
      >
        <Icon
          name={rest.done ? 'check' : 'clock'}
          size={18}
          strokeWidth={2.4}
          color={rest.done ? '#3ddc97' : '#8c9eff'}
        />
        <Text
          style={{
            flexGrow: 1,
            fontFamily: 'Inter_600SemiBold',
            color: '#f2f2f3',
            fontSize: 15,
          }}
        >
          {t(rest.done ? 'workoutDemo.restDone' : 'workoutDemo.rest')}
          <Text
            style={{
              color: '#f2f2f3',
              fontFamily: 'Montserrat_800ExtraBold',
              fontSize: 20,
            }}
          >
            {t('workoutDemo.restTime', { time: rest.label })}
          </Text>
        </Text>
        {!rest.done && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('workoutDemo.restLess')}
              onPress={() => adjustRest(-15)}
              style={buttonStyle}
            >
              <Text style={textStyle}>{t('workoutDemo.minus15')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('workoutDemo.restMore')}
              onPress={() => adjustRest(15)}
              style={buttonStyle}
            >
              <Text style={textStyle}>{t('workoutDemo.plus15')}</Text>
            </Pressable>
          </>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={skipRest}
          style={buttonStyle}
        >
          <Text style={textStyle}>
            {t(rest.done ? 'workoutDemo.hideRest' : 'workoutDemo.skipRest')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

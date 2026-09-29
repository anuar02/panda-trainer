import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import type { DemoScenario } from '@/features/demo/use-demo-scenario';
import { Card } from '@/ui/card';
import { GradientBackground } from '@/ui/gradient-background';
import { Icon } from '@/ui/icons';
import { Mascot } from '@/ui/mascot';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { parity } from '@/ui/parity-tokens';
import { progressWeek } from './fixtures';
import { styles as s } from './styles';
import type { clientProgress } from './ru';

export function ClientProgressScreen({
  scenario = 'normal',
}: {
  scenario?: DemoScenario;
}) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const tx = (key: Exclude<keyof typeof clientProgress, 'weekdays'>) =>
    t(`clientProgress.${key}`);
  const secondary = { color: colors.secondary };
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`client-progress-${scenario}`}
    >
      <View style={s.topbar}>
        <View style={s.trainer}>
          <View style={s.avatar}>
            <GradientBackground
              start={scheme === 'light' ? '#262b45' : '#26272e'}
              end={scheme === 'light' ? '#141726' : '#18191d'}
              radius={16}
            />
            <Text style={s.initials}>{tx('initials')}</Text>
          </View>
          <View>
            <Text className="font-medium text-secondary" style={s.trainerText}>
              {tx('trainerLabel')}
            </Text>
            <Text className="font-bold" style={s.trainerText}>
              {tx('trainer')}
            </Text>
          </View>
        </View>
        <Pressable
          disabled
          accessibilityRole="button"
          accessibilityLabel={tx('notifications')}
          accessibilityHint={tx('unavailable')}
          accessibilityState={{ disabled: true }}
          style={s.iconButton}
        >
          <Icon name="bell" color={colors.ink} size={22} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.body}>
        {scenario === 'loading' ? (
          <View
            style={s.page}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={tx('loading')}
          >
            <Card flush style={s.rowsCard}>
              {[0, 1, 2, 3].map((row) => (
                <View
                  key={row}
                  style={[
                    s.row,
                    row > 0 && {
                      borderTopWidth: 1,
                      borderTopColor:
                        scheme === 'light' ? '#efefeb' : '#212227',
                    },
                  ]}
                >
                  <View
                    style={[
                      s.skeletonCircle,
                      { backgroundColor: colors.sunken },
                    ]}
                  />
                  <View style={s.rowMain}>
                    <View
                      style={[
                        s.skeletonTitle,
                        { backgroundColor: colors.sunken },
                      ]}
                    />
                    <View
                      style={[
                        s.skeletonMeta,
                        { backgroundColor: colors.sunken },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : (
          <>
            {scenario === 'offline' && (
              <Text
                accessibilityRole="alert"
                style={[
                  s.offline,
                  { backgroundColor: parity[scheme].warning.backgroundColor },
                ]}
              >
                {tx('offline')}
              </Text>
            )}
            <Text accessibilityRole="header" style={s.title}>
              {tx('title')}
            </Text>
            <View style={s.page}>
              <View style={s.empty}>
                <View style={s.mascot}>
                  <Svg
                    width={170}
                    height={182}
                    style={s.glow}
                    accessible={false}
                  >
                    <Defs>
                      <RadialGradient
                        id="progressGlow"
                        gradientUnits="userSpaceOnUse"
                        cx={85}
                        cy={88.128}
                        r={73.508}
                      >
                        <Stop
                          offset="0"
                          stopColor="#ffb23d"
                          stopOpacity={0.2975}
                        />
                        <Stop
                          offset="0.45"
                          stopColor="#ff7a1f"
                          stopOpacity={0.102}
                        />
                        <Stop
                          offset="0.7"
                          stopColor="#ff7a1f"
                          stopOpacity={0}
                        />
                      </RadialGradient>
                      <RadialGradient
                        id="progressShadow"
                        gradientUnits="objectBoundingBox"
                        cx="50%"
                        cy="50%"
                        r="50%"
                      >
                        <Stop
                          offset="0"
                          stopColor="#5a280a"
                          stopOpacity={0.28}
                        />
                        <Stop offset="1" stopColor="#5a280a" stopOpacity={0} />
                      </RadialGradient>
                    </Defs>
                    <Ellipse
                      cx={85}
                      cy={88.128}
                      rx={78.2}
                      ry={78.2}
                      fill="url(#progressGlow)"
                    />
                    <Ellipse
                      cx={85}
                      cy={167}
                      rx={49.3}
                      ry={6}
                      fill="url(#progressShadow)"
                    />
                  </Svg>
                  <Mascot pose="front" size={170} style={s.mascotImage} />
                </View>
                <Text accessibilityRole="header" style={s.emptyTitle}>
                  {tx('emptyTitle')}
                </Text>
                <Text style={[s.emptyText, secondary]}>{tx('emptyText')}</Text>
              </View>
            </View>
            <View style={s.visits}>
              <Text accessibilityRole="header" style={s.sectionTitle}>
                {tx('visitsTitle')}
              </Text>
              <Card flush style={s.visitsCard}>
                <View style={s.week}>
                  {progressWeek.map(({ weekday, day }) => (
                    <View key={weekday} style={s.column}>
                      <Text style={[s.weekday, secondary]}>
                        {t(`clientProgress.weekdays.${weekday}`)}
                      </Text>
                      <View
                        accessible
                        accessibilityLabel={t('clientProgress.dayLabel', {
                          weekday: t(`clientProgress.weekdays.${weekday}`),
                          day,
                        })}
                        style={s.day}
                      >
                        <Text style={[s.dayText, secondary]}>{day}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <Text style={[s.footnote, secondary]}>
                  {tx('visitsFootnote')}
                </Text>
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

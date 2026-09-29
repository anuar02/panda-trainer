import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { GradientBackground } from '@/ui/gradient-background';
import { Icon } from '@/ui/icons';
import { Mascot } from '@/ui/mascot';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import type { DemoScenario } from '@/features/demo/use-demo-scenario';
import { programExercises, type ProgramExercise } from './fixtures';
import { styles as s } from './styles';
import type { clientProgram } from './ru';

const guides = {
  squat: require('../../../assets/exercises/0043-qXTaZnJ.gif'),
  deadlift: require('../../../assets/exercises/0085-wQ2c4XD.gif'),
  lunges: require('../../../assets/exercises/0336-RRWFUcw.gif'),
};

export function ClientProgramScreen({
  scenario = 'normal',
}: {
  scenario?: DemoScenario;
}) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const [selected, setSelected] = useState<ProgramExercise | null>(null);
  const tx = (key: Exclude<keyof typeof clientProgram, `${string}Steps`>) =>
    t(`clientProgram.${key}`);
  const hair = scheme === 'light' ? '#efefeb' : '#212227';
  const guide =
    selected &&
    (selected.name === 'squat' ||
      selected.name === 'deadlift' ||
      selected.name === 'lunges')
      ? selected.name
      : null;
  const steps = t(`clientProgram.${guide ?? 'squat'}Steps`, {
    returnObjects: true,
  });
  const plan = (exercise: ProgramExercise) =>
    t(`clientProgram.${exercise.weight ? 'weightedPlan' : 'plan'}`, {
      ...exercise,
      reps: exercise.timed
        ? t('clientProgram.seconds', { count: exercise.reps })
        : exercise.reps,
    });
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`client-program-${scenario}`}
    >
      <View style={s.topbar}>
        <View style={s.trainer}>
          <View style={s.avatar}>
            <GradientBackground start="#262b45" end="#141726" radius={16} />
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
            <Card flush style={s.rows}>
              {[0, 1, 2, 3].map((index) => (
                <View
                  key={index}
                  style={[
                    s.skeletonRow,
                    index > 0 && { borderTopWidth: 1, borderTopColor: hair },
                  ]}
                >
                  <View
                    style={[
                      s.skeletonCircle,
                      { backgroundColor: colors.sunken },
                    ]}
                  />
                  <View style={s.main}>
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
                  {
                    backgroundColor:
                      scheme === 'light'
                        ? 'rgba(255,178,61,0.2)'
                        : 'rgba(245,196,81,0.14)',
                  },
                ]}
              >
                {tx('offline')}
              </Text>
            )}
            <Text accessibilityRole="header" style={s.title}>
              {tx('title')}
            </Text>
            <View style={s.page}>
              {scenario === 'empty' ? (
                <>
                  <View style={s.empty}>
                    <Mascot pose="clipboard" size={170} style={s.mascot} />
                    <Text style={s.emptyTitle}>{tx('empty')}</Text>
                    <Text className="text-secondary" style={s.emptyHint}>
                      {tx('emptyHint')}
                    </Text>
                  </View>
                  <View style={s.schedule}>
                    <Button
                      label={tx('schedule')}
                      variant="soft"
                      onPress={() => router.push('/(client)/home')}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text
                    className="text-secondary"
                    style={[s.note, { backgroundColor: colors.sunken }]}
                  >
                    {tx('note')}
                  </Text>
                  <View style={s.heading}>
                    <Text accessibilityRole="header" style={s.name}>
                      {tx('name')}
                    </Text>
                    <Text className="text-secondary" style={s.date}>
                      {tx('date')}
                    </Text>
                  </View>
                  <Card flush style={s.rows}>
                    {programExercises.map((exercise, index) => (
                      <Pressable
                        key={exercise.id}
                        accessibilityRole="button"
                        accessibilityLabel={tx(exercise.name)}
                        onPress={() => setSelected(exercise)}
                        style={[
                          s.row,
                          index > 0 && {
                            borderTopWidth: 1,
                            borderTopColor: hair,
                          },
                        ]}
                      >
                        <View style={s.lead}>
                          <GradientBackground
                            start={scheme === 'light' ? '#e3e8fd' : '#232845'}
                            end={scheme === 'light' ? '#d3dbfb' : '#1b1f36'}
                            radius={17}
                          />
                          <Text
                            style={[
                              s.number,
                              {
                                color:
                                  scheme === 'light' ? '#2238b0' : '#aab8ff',
                              },
                            ]}
                          >
                            {index + 1}
                          </Text>
                        </View>
                        <View style={s.main}>
                          <Text style={s.rowTitle}>{tx(exercise.name)}</Text>
                          <Text className="text-secondary" style={s.rowMeta}>
                            {plan(exercise)}
                          </Text>
                        </View>
                        <View style={s.right}>
                          <Icon
                            name="chevR"
                            size={20}
                            color={scheme === 'light' ? '#9a9ca6' : '#84858d'}
                          />
                        </View>
                      </Pressable>
                    ))}
                  </Card>
                  <Text className="text-secondary" style={s.footnote}>
                    {tx('footnote')}
                  </Text>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <Sheet
        open={selected !== null}
        title={selected ? tx(selected.name) : ''}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <Text className="text-secondary">{plan(selected)}</Text>
            <Card>
              <View style={s.kv}>
                <Text className="text-secondary">{tx('previous')}</Text>
                <Text>
                  {selected.timed
                    ? t('clientProgram.seconds', { count: selected.reps })
                    : t('clientProgram.previousWeight', selected)}
                </Text>
              </View>
              {selected.record > 0 && (
                <View style={s.kv}>
                  <Text className="text-secondary">{tx('record')}</Text>
                  <Text>
                    {t('clientProgram.weight', { weight: selected.record })}
                  </Text>
                </View>
              )}
            </Card>
            {guide ? (
              <>
                <Image
                  source={guides[guide]}
                  accessibilityLabel={t('clientProgram.demonstration', {
                    name: tx(selected.name),
                  })}
                  style={s.guide}
                />
                <Text
                  className="text-secondary"
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL('https://gymvisual.com/')}
                  style={s.footnote}
                >
                  {tx('attribution')}
                </Text>
                <Text className="font-bold">{tx('how')}</Text>
                {steps.map((step, index) => (
                  <Text
                    key={index}
                    style={s.step}
                  >{`${index + 1}. ${step}`}</Text>
                ))}
              </>
            ) : (
              <Text className="text-secondary" style={s.footnote}>
                {tx('noGuide')}
              </Text>
            )}
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}

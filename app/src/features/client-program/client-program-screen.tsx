import { useTabContentBottomInset } from '@/features/navigation/tab-bar-layout';
import {
  MotionHeader,
  Shimmer,
  MotionScrollView as ScrollView,
  MotionPressable as Pressable,
} from '@/ui/motion';

import { useState } from 'react';
import { Image, Linking, View } from 'react-native';
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

export type ClientProgramExercise = {
  id: string;
  name: string;
  sets: number;
  plannedReps: string | null;
  plannedSeconds: string | null;
  weightGrams: number | null;
  restSeconds: number;
  instructions: readonly string[];
  equipment: string;
  muscleGroup: string;
  bodyweight: boolean;
  note: string | null;
};
export type ClientProgramData = {
  trainerName: string;
  programName: string | null;
  sessionLabel?: string;
  onSiteLabel?: string;
  loading?: boolean;
  exercises: readonly ClientProgramExercise[];
  onOpenSchedule: () => void;
};
export function ClientProgramScreen({
  scenario = 'normal',
  data,
}: {
  scenario?: DemoScenario;
  data?: ClientProgramData;
}) {
  return data ? (
    <ControlledClientProgram data={data} />
  ) : (
    <DemoClientProgramScreen scenario={scenario} />
  );
}
function DemoClientProgramScreen({
  scenario = 'normal',
}: {
  scenario?: DemoScenario;
}) {
  const paddingBottom = useTabContentBottomInset(20);
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
      <MotionHeader motionKey={scenario} style={s.topbar}>
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
      </MotionHeader>
      <ScrollView
        motionKey={scenario}
        contentContainerStyle={[s.body, { paddingBottom }]}
      >
        {scenario === 'loading' ? (
          <View
            style={s.page}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={tx('loading')}
          >
            <Card rows flush style={s.rows}>
              {[0, 1, 2, 3].map((index) => (
                <View
                  key={index}
                  style={[
                    s.skeletonRow,
                    index > 0 && { borderTopWidth: 1, borderTopColor: hair },
                  ]}
                >
                  <Shimmer
                    style={[
                      s.skeletonCircle,
                      { backgroundColor: colors.sunken },
                    ]}
                  />
                  <View style={s.main}>
                    <Shimmer
                      style={[
                        s.skeletonTitle,
                        { backgroundColor: colors.sunken },
                      ]}
                    />
                    <Shimmer
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
                  <Card rows flush style={s.rows}>
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

function ControlledClientProgram({ data }: { data: ClientProgramData }) {
  const paddingBottom = useTabContentBottomInset(20);
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.loading
    ? undefined
    : data.exercises.find((row) => row.id === selectedId);
  const tx = (key: Exclude<keyof typeof clientProgram, `${string}Steps`>) =>
    t(`clientProgram.${key}`);
  const hair = scheme === 'light' ? '#efefeb' : '#212227';
  const initials = data.trainerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
  const plan = (row: ClientProgramExercise) => {
    const reps =
      row.plannedSeconds !== null
        ? t('clientProgram.secondsTarget', { value: row.plannedSeconds })
        : row.plannedReps;
    if (reps === null) return t('clientProgram.setsOnly', { sets: row.sets });
    return row.weightGrams !== null
      ? t('clientProgram.weightedPlan', {
          sets: row.sets,
          reps,
          weight: new Intl.NumberFormat(i18n.language, {
            maximumFractionDigits: 3,
          }).format(row.weightGrams / 1000),
        })
      : t('clientProgram.plan', { sets: row.sets, reps });
  };
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`client-program-${data.loading ? 'loading' : data.exercises.length ? 'normal' : 'empty'}`}
    >
      <MotionHeader style={s.topbar}>
        <View style={s.trainer}>
          <View style={s.avatar}>
            <GradientBackground start="#262b45" end="#141726" radius={16} />
            <Text style={s.initials}>{initials}</Text>
          </View>
          <View>
            <Text className="font-medium text-secondary" style={s.trainerText}>
              {tx('trainerLabel')}
            </Text>
            <Text className="font-bold" style={s.trainerText}>
              {data.trainerName}
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
      </MotionHeader>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom }]}>
        {data.loading ? (
          <View
            style={s.page}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={tx('loading')}
          >
            <Card rows flush style={s.rows}>
              {[0, 1, 2, 3].map((index) => (
                <View
                  key={index}
                  style={[
                    s.skeletonRow,
                    index > 0 && { borderTopWidth: 1, borderTopColor: hair },
                  ]}
                >
                  <Shimmer
                    style={[
                      s.skeletonCircle,
                      { backgroundColor: colors.sunken },
                    ]}
                  />
                  <View style={s.main}>
                    <Shimmer
                      style={[
                        s.skeletonTitle,
                        { backgroundColor: colors.sunken },
                      ]}
                    />
                    <Shimmer
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
            <Text accessibilityRole="header" style={s.title}>
              {tx('title')}
            </Text>
            <View style={s.page}>
              {data.onSiteLabel && (
                <Text
                  className="text-secondary"
                  style={[s.note, { backgroundColor: colors.sunken }]}
                >
                  {data.onSiteLabel}
                </Text>
              )}
              {!data.exercises.length ? (
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
                      onPress={data.onOpenSchedule}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={s.heading}>
                    {data.programName && (
                      <Text accessibilityRole="header" style={s.name}>
                        {data.programName}
                      </Text>
                    )}
                    <Text className="text-secondary" style={s.date}>
                      {data.sessionLabel ?? tx('currentPlan')}
                    </Text>
                  </View>
                  <Card rows flush style={s.rows}>
                    {data.exercises.map((row, index) => (
                      <Pressable
                        key={row.id}
                        accessibilityRole="button"
                        accessibilityLabel={row.name}
                        onPress={() => setSelectedId(row.id)}
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
                          <Text style={s.rowTitle}>{row.name}</Text>
                          <Text className="text-secondary" style={s.rowMeta}>
                            {plan(row)}
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
        open={Boolean(selected)}
        title={selected?.name ?? ''}
        onClose={() => setSelectedId(null)}
      >
        {selected && (
          <>
            <Text className="text-secondary">{plan(selected)}</Text>
            <Card>
              <View style={s.kv}>
                <Text className="text-secondary">{tx('rest')}</Text>
                <Text>
                  {t('clientProgram.seconds', { count: selected.restSeconds })}
                </Text>
              </View>
              {selected.equipment && (
                <View style={s.kv}>
                  <Text className="text-secondary">{tx('equipment')}</Text>
                  <Text>{selected.equipment}</Text>
                </View>
              )}
              {selected.muscleGroup && (
                <View style={s.kv}>
                  <Text className="text-secondary">{tx('muscleGroup')}</Text>
                  <Text>{selected.muscleGroup}</Text>
                </View>
              )}
              {selected.bodyweight && <Text>{tx('bodyweight')}</Text>}
            </Card>
            {selected.note && (
              <Text className="text-secondary" style={s.note}>
                {selected.note}
              </Text>
            )}
            {selected.instructions.length ? (
              <>
                <Text className="font-bold">{tx('how')}</Text>
                {selected.instructions.map((instruction, index) => (
                  <Text key={index} style={s.step}>
                    {t('clientProgram.instructionStep', {
                      position: index + 1,
                      instruction,
                    })}
                  </Text>
                ))}
              </>
            ) : (
              <Text className="text-secondary" style={s.footnote}>
                {tx('noGuide')}
              </Text>
            )}
            <Button
              label={tx('close')}
              variant="soft"
              onPress={() => setSelectedId(null)}
            />
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}

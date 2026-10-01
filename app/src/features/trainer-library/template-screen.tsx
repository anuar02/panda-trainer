import type { Template } from '@/domain/templates';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { DemoScenario } from '@/features/demo/use-demo-scenario';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { ExerciseDetailsSheet } from './exercise-details-sheet';
import { media, type LibraryExercise, type LibraryMediaMap } from './fixtures';
import { styles as s } from './styles';

export function TemplateScreen({
  id,
  onBack,
  onUse,
  onAssignProgram,
  assignLabel,
  assignDisabled = false,
  feedback,
  scenario = 'normal',
  templates: suppliedTemplates,
  onEdit,
  onCopy,
  suppliedExercises,
  suppliedMedia,
}: {
  id?: string;
  templates?: Template[];
  onEdit?: () => void;
  onCopy?: () => void;
  onBack: () => void;
  onUse?: (id: string) => void;
  onAssignProgram?: (id: string) => void;
  assignLabel?: string;
  assignDisabled?: boolean;
  feedback?: ReactNode;
  scenario?: DemoScenario;
  suppliedExercises?: LibraryExercise[];
  suppliedMedia?: LibraryMediaMap;
}) {
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const templates: (
    Template | (typeof import('./ru').trainerLibrary.templateData)[number]
  )[] =
    suppliedTemplates ??
    t('trainerLibrary.templateData', { returnObjects: true });
  const exercises: LibraryExercise[] =
    suppliedExercises ??
    t('trainerLibrary.exerciseData', { returnObjects: true });
  const exerciseMedia = suppliedMedia ?? media;
  const template = templates.find((entry) => entry.id === id);
  const [selected, setSelected] = useState<LibraryExercise | null>(null);
  const secondary = { color: colors.secondary };
  const accent = scheme === 'dark' ? '#8c9eff' : '#2b48d6';
  const summary = (count: number, key: 'exercises' | 'sets') => (
    <Text style={[d.summary, secondary]}>
      <Text style={[d.number, { color: colors.ink }]}>{count}</Text>{' '}
      {t(
        key === 'exercises'
          ? 'trainerLibrary.templateExercises'
          : 'trainerLibrary.templateSets',
      )}
    </Text>
  );
  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={s.root}
      testID={`trainer-template-${scenario}`}
    >
      <View style={d.topbar}>
        <Pressable
          style={s.iconButton}
          accessibilityRole="button"
          accessibilityLabel={t('trainerLibrary.back')}
          onPress={onBack}
        >
          <Icon name="chevL" size={24} color={colors.ink} />
        </Pressable>
        <Text style={d.topTitle}>{t('trainerLibrary.template')}</Text>
        <Pressable
          style={s.iconButton}
          accessibilityRole="button"
          accessibilityLabel={t('trainerLibrary.copy')}
          accessibilityState={{ disabled: !onCopy || !template }}
          disabled={!onCopy || !template}
          onPress={onCopy}
        >
          <Icon name="copy" size={22} color={colors.ink} />
        </Pressable>
      </View>
      {feedback}
      {template ? (
        <>
          <ScrollView contentContainerStyle={s.body}>
            <Text
              style={[
                s.eyebrow,
                { color: accent, fontFamily: 'Inter_800ExtraBold' },
              ]}
            >
              {t(
                'custom' in template && template.custom
                  ? 'templateEditor.myTemplate'
                  : 'trainerLibrary.readyPlan',
              )}
            </Text>
            <Text accessibilityRole="header" style={s.detailTitle}>
              {template.name}
            </Text>
            <Text style={[s.description, secondary]}>
              {('description' in template && template.description) ||
                t('trainerLibrary.description')}
            </Text>
            <View style={[s.planSummary, { borderColor: colors.border }]}>
              {summary(template.exercises.length, 'exercises')}
              {summary(
                template.exercises.reduce(
                  (total, exercise) => total + exercise.sets,
                  0,
                ),
                'sets',
              )}
            </View>
            <View style={[s.resultHeading, d.heading]}>
              <Text style={[s.sectionTitle, d.sectionTitle]}>
                {t('trainerLibrary.order')}
              </Text>
              <Button
                compact
                variant="ghost"
                label={t('trainerLibrary.edit')}
                disabled={!onEdit}
                onPress={onEdit}
              />
            </View>
            {template.exercises.map((entry, index) => {
              const exercise = exercises.find((item) => item.id === entry.id);
              return (
                <View
                  key={entry.id}
                  style={[s.planRow, { borderColor: colors.border }]}
                >
                  <View
                    style={[
                      s.order,
                      {
                        backgroundColor:
                          scheme === 'dark'
                            ? 'rgba(111,134,255,0.16)'
                            : 'rgba(43,72,214,0.1)',
                      },
                    ]}
                  >
                    <Text style={[s.small, d.order, { color: accent }]}>
                      {String(index + 1).padStart(2, '0')}
                    </Text>
                  </View>
                  <Pressable
                    style={[s.flex, d.exercise]}
                    accessibilityRole="button"
                    onPress={() => setSelected(exercise ?? null)}
                  >
                    <Text style={[s.planName, d.planName]}>
                      {exercise?.name}
                    </Text>
                    <Text style={[s.previewText, secondary]}>
                      {t(`trainerLibrary.${entry.target ? 'weight' : 'plan'}`, {
                        ...entry,
                        target: new Intl.NumberFormat(i18n.language).format(
                          entry.target,
                        ),
                      })}
                      {'custom' in template &&
                        template.custom &&
                        'rest' in entry &&
                        t('templateEditor.restSummary', { rest: entry.rest })}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
          <View
            style={[
              d.footer,
              { borderColor: colors.border, backgroundColor: colors.canvas },
            ]}
          >
            <Button
              labelStyle={d.useText}
              style={d.useButton}
              label={
                onAssignProgram ? (assignLabel ?? '') : t('trainerLibrary.use')
              }
              icon={<Icon name="calendarPlus" size={18} color="#ffffff" />}
              disabled={onAssignProgram ? assignDisabled : !onUse}
              onPress={() =>
                onAssignProgram
                  ? onAssignProgram(template.id)
                  : onUse?.(template.id)
              }
            />
          </View>
        </>
      ) : (
        <View style={s.empty}>
          <Text accessibilityRole="alert">{t('common.notFound')}</Text>
          <Button
            variant="soft"
            label={t('trainerLibrary.back')}
            onPress={onBack}
          />
        </View>
      )}
      <ExerciseDetailsSheet
        selected={selected}
        onClose={() => setSelected(null)}
        suppliedMedia={exerciseMedia}
      />
    </SafeAreaView>
  );
}

const d = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
    paddingHorizontal: 8,
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Montserrat_700Bold',
    fontSize: 17,
    lineHeight: 24.65,
    letterSpacing: -0.2,
  },
  summary: { fontSize: 12, lineHeight: 29 },
  sectionTitle: { fontFamily: 'Inter_800ExtraBold' },
  planName: { fontFamily: 'Inter_700Bold' },
  useText: { fontSize: 13, lineHeight: 18.85 },
  useButton: { minHeight: 48, paddingVertical: 12 },
  number: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    fontVariant: ['tabular-nums'],
  },
  heading: { marginTop: 0 },
  order: { fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] },
  exercise: { minHeight: 44 },
  footer: {
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
});

import { useTabBarLayout } from '@/features/navigation/tab-bar-layout';
import {
  MotionScrollView as ScrollView,
  MotionPressable as Pressable,
} from '@/ui/motion';
import type { Template, TemplateDraft } from '@/domain/templates';
import { useState, type ReactNode } from 'react';
import { ExerciseDetailsSheet } from './exercise-details-sheet';
import { Image, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { parity } from '@/ui/parity-tokens';
import type { DemoScenario } from '@/features/demo/use-demo-scenario';
import {
  matches,
  normalize,
  media,
  type LibraryExercise,
  type LibraryMediaMap,
  type LibraryTemplate,
} from './fixtures';
import { styles as s } from './styles';

function Star({
  color,
  filled = false,
  size = 20,
}: {
  color: string;
  filled?: boolean;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={1.7}
      strokeLinejoin="round"
    >
      <Path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2L12 17.3l-5.7 2.9 1.1-6.2-4.5-4.4 6.3-.9Z" />
    </Svg>
  );
}

export function TrainerLibraryScreen({
  scenario = 'normal',
  onOpenTemplate,
  templates: suppliedTemplates,
  onCreate,
  onResume,
  draft,
  initialTab = 'exercises',
  suppliedExercises,
  templateExercises,
  suppliedMedia,
  onCreateExercise,
  onArchiveExercise,
  header,
}: {
  scenario?: DemoScenario;
  onOpenTemplate: (id: string) => void;
  templates?: Template[];
  onCreate?: () => void;
  onResume?: () => void;
  draft?: TemplateDraft | null;
  initialTab?: 'exercises' | 'templates';
  suppliedExercises?: LibraryExercise[];
  templateExercises?: LibraryExercise[];
  suppliedMedia?: LibraryMediaMap;
  onCreateExercise?: (name: string) => void;
  onArchiveExercise?: (exercise: LibraryExercise) => void;
  header?: ReactNode;
}) {
  const { bottomInset } = useTabBarLayout();
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const [tab, setTab] = useState<'exercises' | 'templates'>(initialTab);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [demos, setDemos] = useState(false);
  const [selected, setSelected] = useState<LibraryExercise | null>(null);
  const exercises: LibraryExercise[] =
    suppliedExercises ??
    t('trainerLibrary.exerciseData', { returnObjects: true });
  const allExercises: LibraryExercise[] = templateExercises ?? exercises;
  const exerciseMedia = suppliedMedia ?? media;
  const templates =
    suppliedTemplates ??
    t('trainerLibrary.templateData', { returnObjects: true });
  const accent = scheme === 'dark' ? '#8c9eff' : '#2b48d6';
  const secondary = { color: colors.secondary };
  const surface = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };
  const groups = [...new Set(exercises.map((e) => e.group))];
  const items = exercises
    .filter(
      (e) =>
        matches(
          query,
          [e.name, e.group, e.equipment, ...e.aliases].join(' '),
        ) &&
        (!group || e.group === group) &&
        (!equipment || e.equipment === equipment) &&
        (!onlyFavorites || favorites.includes(e.id)) &&
        (!demos || exerciseMedia[e.id]),
    )
    .sort(
      (a, b) =>
        Number(Boolean(exerciseMedia[b.id])) -
          Number(Boolean(exerciseMedia[a.id])) ||
        a.name.localeCompare(b.name, 'ru'),
    );
  const plans = templates.filter((p) =>
    matches(
      query,
      [
        p.name,
        'description' in p ? p.description : '',
        ...p.exercises.map(
          (e) => allExercises.find((x) => x.id === e.id)?.name,
        ),
      ].join(' '),
    ),
  );
  const count = (value: number) =>
    t('trainerLibrary.exercises', { count: value });
  const reset = () => {
    setQuery('');
    setGroup(null);
    setEquipment(null);
    setOnlyFavorites(false);
    setDemos(false);
  };
  const totalSets = (plan: LibraryTemplate) =>
    plan.exercises.reduce((n, e) => n + e.sets, 0);
  const eyebrow = (
    <Text style={[s.eyebrow, { color: accent }]}>
      {t('trainerLibrary.readyPlan')}
    </Text>
  );
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`trainer-library-${scenario}`}
    >
      {header}
      <ScrollView
        motionKey={scenario}
        contentContainerStyle={[
          s.body,
          bottomInset ? { paddingBottom: bottomInset } : undefined,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.heading}>
          <Text style={[s.eyebrow, { color: accent }]}>
            {t('trainerLibrary.eyebrow')}
          </Text>
          <Text accessibilityRole="header" style={s.title}>
            {t('trainerLibrary.title')}
          </Text>
          <Text style={[s.subtitle, secondary]}>
            {t('trainerLibrary.subtitle')}
          </Text>
        </View>
        <View style={[s.tabs, { backgroundColor: colors.sunken }]}>
          {(['exercises', 'templates'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === value }}
              style={[
                s.tab,
                tab === value && {
                  backgroundColor: colors.surface,
                  boxShadow: parity[scheme].cardShadow,
                },
              ]}
              onPress={() => {
                setTab(value);
                setQuery('');
              }}
            >
              <Text style={[s.tabText, tab !== value && secondary]}>
                {t(`trainerLibrary.${value}Tab`)}
              </Text>
              <Text
                style={[s.count, secondary, { backgroundColor: colors.sunken }]}
              >
                {value === 'exercises' ? exercises.length : templates.length}
              </Text>
            </Pressable>
          ))}
        </View>
        {tab === 'templates' && (
          <View style={[s.create, { backgroundColor: colors.sunken }]}>
            <Text style={s.createTitle}>{t('trainerLibrary.createTitle')}</Text>
            <Text style={[s.createText, secondary]}>
              {t('trainerLibrary.createText')}
            </Text>
            <Button
              label={t('trainerLibrary.create')}
              icon={<Icon name="plus" size={18} color="#ffffff" />}
              compact
              disabled={!onCreate}
              onPress={onCreate}
            />
          </View>
        )}
        {tab === 'templates' && draft && (
          <Pressable
            accessibilityRole="button"
            onPress={onResume}
            style={s.resultHeading}
          >
            <View>
              <Text>{t('templateEditor.resume')}</Text>
              <Text style={[s.small, secondary]}>
                {draft.name || t('templateEditor.untitled')}
              </Text>
            </View>
            <Icon name="chevR" size={20} color={colors.secondary} />
          </Pressable>
        )}
        <View
          style={[
            s.search,
            surface,
            { borderColor: scheme === 'dark' ? '#3a3b42' : '#d0d0cb' },
          ]}
        >
          <Icon name="search" size={20} color={colors.secondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            accessibilityLabel={t(
              `trainerLibrary.${tab === 'exercises' ? 'searchExercises' : 'searchTemplates'}`,
            )}
            placeholder={t(
              `trainerLibrary.${tab === 'exercises' ? 'exercisePlaceholder' : 'templatePlaceholder'}`,
            )}
            placeholderTextColor={colors.secondary}
            style={[s.input, { color: colors.ink }]}
          />
        </View>
        {tab === 'exercises' && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.groups}
            >
              {[null, ...groups].map((value) => (
                <Pressable
                  key={value ?? 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: group === value }}
                  onPress={() => setGroup(value)}
                  style={[
                    s.group,
                    { borderColor: colors.border },
                    group === value && {
                      backgroundColor: colors.ink,
                      borderColor: colors.ink,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.groupText,
                      {
                        color:
                          group === value
                            ? scheme === 'dark'
                              ? '#0b0c0e'
                              : '#ffffff'
                            : colors.secondary,
                      },
                    ]}
                  >
                    {value ?? t('trainerLibrary.all')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={[s.filters, { borderColor: colors.border }]}>
              <Pressable
                motionKind="chip"
                style={[s.filter, { width: 122 }]}
                accessibilityRole="button"
                onPress={() => setEquipmentOpen(true)}
              >
                <Icon name="filter" size={16} color={colors.secondary} />
                <Text style={[s.filterText, secondary]}>
                  {equipment ?? t('trainerLibrary.equipment')}
                </Text>
                <Icon name="chevD" size={12} color={colors.secondary} />
              </Pressable>
              <Pressable
                motionKind="chip"
                accessibilityRole="button"
                accessibilityState={{ selected: onlyFavorites }}
                onPress={() => setOnlyFavorites(!onlyFavorites)}
                style={s.filter}
              >
                <Star
                  size={16}
                  color={onlyFavorites ? accent : colors.secondary}
                  filled={onlyFavorites}
                />
                <Text
                  style={[
                    s.filterText,
                    { color: onlyFavorites ? accent : colors.secondary },
                  ]}
                >
                  {t('trainerLibrary.favorites')}
                </Text>
              </Pressable>
              <Pressable
                motionKind="chip"
                style={s.filter}
                accessibilityRole="button"
                accessibilityState={{ selected: demos }}
                onPress={() => setDemos(!demos)}
              >
                <Icon
                  name="play"
                  size={15}
                  color={demos ? accent : colors.secondary}
                />
                <Text
                  style={[
                    s.filterText,
                    { color: demos ? accent : colors.secondary },
                  ]}
                >
                  {t('trainerLibrary.technique')}
                </Text>
              </Pressable>
            </View>
          </>
        )}
        <View style={s.resultHeading}>
          <Text style={s.sectionTitle}>
            {tab === 'templates'
              ? t('trainerLibrary.yourTemplates')
              : onlyFavorites
                ? t('trainerLibrary.favorites')
                : (group ?? t('trainerLibrary.allExercises'))}
          </Text>
          <Text style={[s.small, secondary]} accessibilityLiveRegion="polite">
            {tab === 'templates' ? plans.length : count(items.length)}
          </Text>
        </View>
        {tab === 'exercises' ? (
          <View style={s.list}>
            {items.map((e) => (
              <View key={e.id} style={[s.exercise, surface]}>
                <Pressable
                  style={s.exerciseOpen}
                  accessibilityRole="button"
                  onPress={() => setSelected(e)}
                >
                  <View style={[s.thumb, { backgroundColor: colors.sunken }]}>
                    {exerciseMedia[e.id] ? (
                      <Image
                        source={exerciseMedia[e.id]?.image}
                        style={s.thumbnail}
                      />
                    ) : (
                      <Icon
                        name="dumbbell"
                        size={24}
                        color={colors.secondary}
                      />
                    )}
                  </View>
                  <View style={s.exerciseText}>
                    <Text style={s.exerciseName}>{e.name}</Text>
                    <Text style={[s.small, secondary]}>
                      {t('trainerLibrary.groupEquipment', e)}
                    </Text>
                    {exerciseMedia[e.id] && (
                      <Text style={[s.demoText, { color: accent }]}>
                        {t('trainerLibrary.demo')}
                      </Text>
                    )}
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: favorites.includes(e.id),
                  }}
                  accessibilityLabel={t(
                    `trainerLibrary.${favorites.includes(e.id) ? 'unfavorite' : 'favorite'}`,
                    { name: e.name },
                  )}
                  style={s.iconButton}
                  onPress={() =>
                    setFavorites(
                      favorites.includes(e.id)
                        ? favorites.filter((id) => id !== e.id)
                        : [...favorites, e.id],
                    )
                  }
                >
                  <Star
                    color={
                      favorites.includes(e.id)
                        ? colors.accent
                        : colors.secondary
                    }
                    filled={favorites.includes(e.id)}
                  />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <View style={s.templates}>
            {plans.map((p) => (
              <Pressable
                accessibilityRole="button"
                key={p.id}
                onPress={() => onOpenTemplate(p.id)}
                style={[s.templateCard, surface]}
              >
                <View style={s.templateTop}>
                  {'custom' in p && p.custom ? (
                    <Text style={[s.eyebrow, { color: accent }]}>
                      {t('templateEditor.myTemplate')}
                    </Text>
                  ) : (
                    eyebrow
                  )}
                  <Icon name="arrowRight" size={20} color={colors.secondary} />
                </View>
                <Text style={s.templateTitle}>{p.name}</Text>
                <Text style={[s.summary, secondary]}>
                  {t('trainerLibrary.summary', {
                    exercises: count(p.exercises.length),
                    sets: t('trainerLibrary.sets', { count: totalSets(p) }),
                  })}
                </Text>
                <View
                  style={[
                    s.preview,
                    {
                      borderColor: scheme === 'dark' ? '#212227' : '#efefeb',
                    },
                  ]}
                >
                  {p.exercises.slice(0, 3).map((e, i) => (
                    <View key={e.id} style={s.previewRow}>
                      <Text style={[s.demoText, secondary]}>
                        {String(i + 1).padStart(2, '0')}
                      </Text>
                      <Text style={s.previewText}>
                        {allExercises.find((x) => x.id === e.id)?.name}
                      </Text>
                    </View>
                  ))}
                </View>
                {p.exercises.length > 3 && (
                  <Text style={[s.more, secondary]}>
                    {t('trainerLibrary.more', {
                      count: p.exercises.length - 3,
                    })}{' '}
                    {count(p.exercises.length - 3).replace(/^\d+\s/, '')}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        )}
        {(tab === 'exercises' ? items.length === 0 : plans.length === 0) && (
          <View style={s.empty}>
            <Icon name="search" size={28} color={colors.secondary} />
            <Text style={s.emptyTitle}>
              {t(
                `trainerLibrary.${tab === 'templates' ? 'noTemplates' : onlyFavorites ? 'noFavorites' : 'noResults'}`,
              )}
            </Text>
            <Text style={[s.emptyText, secondary]}>
              {t(
                `trainerLibrary.${tab === 'templates' ? 'noTemplatesText' : onlyFavorites ? 'noFavoritesText' : 'noResultsText'}`,
              )}
            </Text>
            <Button
              label={t(
                `trainerLibrary.${tab === 'templates' ? 'resetSearch' : 'reset'}`,
              )}
              variant="soft"
              onPress={reset}
            />
            {tab === 'exercises' &&
              query.trim().length > 0 &&
              onCreateExercise &&
              !exercises.some(
                (exercise) =>
                  normalize(exercise.name).trim() === normalize(query).trim(),
              ) && (
                <Button
                  label={t('workout.createExercise', { name: query.trim() })}
                  variant="soft"
                  onPress={() => onCreateExercise(query.trim())}
                />
              )}
          </View>
        )}
      </ScrollView>
      <Sheet
        open={equipmentOpen}
        title={t('trainerLibrary.equipment')}
        onClose={() => setEquipmentOpen(false)}
      >
        {[null, ...new Set(exercises.map((e) => e.equipment))]
          .sort()
          .map((value) => (
            <Button
              key={value ?? 'all'}
              label={value ?? t('trainerLibrary.equipment')}
              variant="ghost"
              onPress={() => {
                setEquipment(value);
                setEquipmentOpen(false);
              }}
            />
          ))}
      </Sheet>
      <ExerciseDetailsSheet
        selected={selected}
        onClose={() => setSelected(null)}
        suppliedMedia={exerciseMedia}
        onArchiveExercise={onArchiveExercise}
      />
    </SafeAreaView>
  );
}

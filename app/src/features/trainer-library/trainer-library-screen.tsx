import { useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
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
  media,
  type LibraryExercise,
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
}: {
  scenario?: DemoScenario;
}) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const [tab, setTab] = useState<'exercises' | 'templates'>('exercises');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [demos, setDemos] = useState(false);
  const [selected, setSelected] = useState<LibraryExercise | null>(null);
  const [template, setTemplate] = useState<LibraryTemplate | null>(null);
  const exercises = t('trainerLibrary.exerciseData', { returnObjects: true });
  const templates = t('trainerLibrary.templateData', { returnObjects: true });
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
        (!demos || media[e.id]),
    )
    .sort(
      (a, b) =>
        Number(Boolean(media[b.id])) - Number(Boolean(media[a.id])) ||
        a.name.localeCompare(b.name, 'ru'),
    );
  const plans = templates.filter((p) =>
    matches(
      query,
      [
        p.name,
        ...p.exercises.map((e) => exercises.find((x) => x.id === e.id)?.name),
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
      {template && (
        <View style={s.topbar}>
          <Pressable
            accessibilityLabel={t('trainerLibrary.back')}
            accessibilityRole="button"
            style={s.iconButton}
            onPress={() => setTemplate(null)}
          >
            <Icon name="chevL" size={22} color={colors.ink} />
          </Pressable>
          <Text style={s.sectionTitle}>{t('trainerLibrary.template')}</Text>
          <Pressable
            accessibilityLabel={t('trainerLibrary.copy')}
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityHint={t('trainerLibrary.unavailable')}
            style={s.iconButton}
            disabled
          >
            <Icon name="copy" size={22} color={colors.secondary} />
          </Pressable>
        </View>
      )}
      <ScrollView
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
      >
        {template ? (
          <>
            {eyebrow}
            <Text style={s.detailTitle}>{template.name}</Text>
            <Text style={[s.description, secondary]}>
              {t('trainerLibrary.description')}
            </Text>
            <View style={[s.planSummary, { borderColor: colors.border }]}>
              <Text style={secondary}>{count(template.exercises.length)}</Text>
              <Text style={secondary}>
                {t('trainerLibrary.sets', { count: totalSets(template) })}
              </Text>
            </View>
            <View style={s.resultHeading}>
              <Text style={s.sectionTitle}>{t('trainerLibrary.order')}</Text>
              <Button
                label={t('trainerLibrary.edit')}
                variant="ghost"
                compact
                disabled
              />
            </View>
            {template.exercises.map((entry, i) => {
              const exercise = exercises.find((e) => e.id === entry.id);
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
                    <Text style={[s.small, { color: accent }]}>
                      {String(i + 1).padStart(2, '0')}
                    </Text>
                  </View>
                  <Pressable
                    style={s.flex}
                    accessibilityRole="button"
                    onPress={() => setSelected(exercise ?? null)}
                  >
                    <Text style={s.planName}>{exercise?.name}</Text>
                    <Text style={[s.previewText, secondary]}>
                      {t(
                        `trainerLibrary.${entry.target ? 'weight' : 'plan'}`,
                        entry,
                      )}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
            <View style={s.footer}>
              <Button label={t('trainerLibrary.use')} disabled />
            </View>
          </>
        ) : (
          <>
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
                    style={[
                      s.count,
                      secondary,
                      { backgroundColor: colors.sunken },
                    ]}
                  >
                    {value === 'exercises'
                      ? exercises.length
                      : templates.length}
                  </Text>
                </Pressable>
              ))}
            </View>
            {tab === 'templates' && (
              <View style={[s.create, { backgroundColor: colors.sunken }]}>
                <Text style={s.createTitle}>
                  {t('trainerLibrary.createTitle')}
                </Text>
                <Text style={[s.createText, secondary]}>
                  {t('trainerLibrary.createText')}
                </Text>
                <Button
                  label={t('trainerLibrary.create')}
                  icon={<Icon name="plus" size={18} color="#ffffff" />}
                  compact
                  disabled
                />
              </View>
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
              <Text
                style={[s.small, secondary]}
                accessibilityLiveRegion="polite"
              >
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
                      <View
                        style={[s.thumb, { backgroundColor: colors.sunken }]}
                      >
                        {media[e.id] ? (
                          <Image
                            source={media[e.id]?.image}
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
                        {media[e.id] && (
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
                    onPress={() => setTemplate(p)}
                    style={[s.templateCard, surface]}
                  >
                    <View style={s.templateTop}>
                      {eyebrow}
                      <Icon
                        name="arrowRight"
                        size={20}
                        color={colors.secondary}
                      />
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
                          borderColor:
                            scheme === 'dark' ? '#212227' : '#efefeb',
                        },
                      ]}
                    >
                      {p.exercises.slice(0, 3).map((e, i) => (
                        <View key={e.id} style={s.previewRow}>
                          <Text style={[s.demoText, secondary]}>
                            {String(i + 1).padStart(2, '0')}
                          </Text>
                          <Text style={s.previewText}>
                            {exercises.find((x) => x.id === e.id)?.name}
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
            {(tab === 'exercises'
              ? items.length === 0
              : plans.length === 0) && (
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
              </View>
            )}
          </>
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
      <Sheet
        open={Boolean(selected)}
        title={selected?.name ?? ''}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <Text style={secondary}>
              {t('trainerLibrary.groupEquipment', selected)}
            </Text>
            {media[selected.id] ? (
              <>
                <Image source={media[selected.id]?.gif} style={s.guideImage} />
                <Text
                  style={[s.small, secondary]}
                  accessibilityRole="link"
                  onPress={() => Linking.openURL('https://gymvisual.com/')}
                >
                  {t('trainerLibrary.attribution')}
                </Text>
                <Text style={s.sectionTitle}>
                  {t('trainerLibrary.instructions')}
                </Text>
                {selected.instructions.map((step, i) => (
                  <Text key={step}>
                    {t('trainerLibrary.step', { number: i + 1, text: step })}
                  </Text>
                ))}
              </>
            ) : (
              <Text style={secondary}>{t('trainerLibrary.noGuide')}</Text>
            )}
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}

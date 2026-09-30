import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icons';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { useToast } from '@/ui/toast';
import { trainerLibrary } from '@/features/trainer-library/ru';
import { matches, media } from '@/features/trainer-library/fixtures';
import { styles as libraryStyles } from '@/features/trainer-library/styles';
import type { TemplateError } from '@/domain/templates';
import { useTemplates } from './provider';
export function TemplateEditorScreen({
  onLeave,
  onSaved,
}: {
  onLeave: () => void;
  onSaved: (id: string) => void;
}) {
  const store = useTemplates();
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const toast = useToast();
  const [sheet, setSheet] = useState<'picker' | 'discard' | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<{
    key: TemplateError;
    index?: number;
  } | null>(null);
  const [edited, setEdited] = useState(false);
  const updateDraft: typeof store.update = (next) => {
    setEdited(true);
    store.update(next);
  };
  const initialized = useRef(false);
  const nameInput = useRef<TextInput>(null);
  useEffect(() => {
    if (store.ready && !initialized.current) {
      initialized.current = true;
      if (!store.draft) store.begin();
    }
  }, [store]);
  const draft = store.draft;
  const secondary = { color: colors.secondary };
  const surface = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };
  const accent = scheme === 'dark' ? '#8c9eff' : '#2b48d6';
  const input = [
    s.input,
    surface,
    {
      color: colors.ink,
      borderColor: scheme === 'dark' ? '#3a3b42' : '#d0d0cb',
    },
  ];
  const iconButton = (
    name: IconName,
    label: string,
    press: () => void,
    disabled = false,
    rotate = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || store.busy }}
      disabled={disabled || store.busy}
      onPress={press}
      style={[
        libraryStyles.iconButton,
        (disabled || store.busy) && { opacity: 0.4 },
        rotate && { transform: [{ rotate: '180deg' }] },
      ]}
    >
      <Icon name={name} size={name === 'chevL' ? 24 : 20} color={colors.ink} />
    </Pressable>
  );
  if (store.readError)
    return (
      <SafeAreaView style={s.root}>
        <Text accessibilityRole="alert">{t('templateEditor.readError')}</Text>
        <Button label={t('templateEditor.retry')} onPress={store.retry} />
      </SafeAreaView>
    );
  if (!store.ready || !draft)
    return (
      <SafeAreaView style={s.root}>
        <ActivityIndicator accessibilityLabel={t('templateEditor.saving')} />
      </SafeAreaView>
    );
  const updateExercise = (
    index: number,
    patch: Partial<(typeof draft.exercises)[number]>,
  ) =>
    updateDraft({
      ...draft,
      exercises: draft.exercises.map((e, i) =>
        i === index ? { ...e, ...patch } : e,
      ),
    });
  const move = (index: number, delta: number) => {
    const exercises = [...draft.exercises];
    const to = index + delta;
    if (!exercises[index] || !exercises[to]) return;
    [exercises[index], exercises[to]] = [exercises[to]!, exercises[index]!];
    updateDraft({ ...draft, exercises });
  };
  const save = async () => {
    const result = await store.save();
    if (result.ok) {
      toast(t('templateEditor.saved'));
      onSaved(result.template.id);
    } else {
      setError({ key: result.error, index: result.index });
      if (result.error === 'name' || result.error === 'duplicate')
        nameInput.current?.focus();
    }
  };
  const filtered = trainerLibrary.exerciseData.filter((e) =>
    matches(query, [e.name, e.group, ...e.aliases].join(' ')),
  );
  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={s.root}
      testID="template-editor"
    >
      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.topbar}>
          {iconButton('chevL', t('trainerLibrary.back'), onLeave)}
          <Text style={s.topTitle}>
            {t(draft.id ? 'templateEditor.editing' : 'templateEditor.title')}
          </Text>
          {iconButton('trash', t('templateEditor.discard'), () =>
            setSheet('discard'),
          )}
        </View>
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.intro}>
            <Text
              style={[
                libraryStyles.eyebrow,
                { color: accent, fontFamily: 'Inter_800ExtraBold' },
              ]}
            >
              {t('templateEditor.eyebrow')}
            </Text>
            <Text
              accessibilityRole="header"
              style={[libraryStyles.title, s.title]}
            >
              {t('templateEditor.heading')}
            </Text>
            <Text style={[libraryStyles.subtitle, secondary]}>
              {t('templateEditor.subtitle')}
            </Text>
          </View>
          <View style={s.field}>
            <Text style={s.label}>{t('templateEditor.name')}</Text>
            <TextInput
              ref={nameInput}
              style={input}
              accessibilityLabel={t('templateEditor.name')}
              placeholder={t('templateEditor.namePlaceholder')}
              placeholderTextColor={colors.secondary}
              value={draft.name}
              maxLength={80}
              editable={!store.busy}
              onChangeText={(name) => updateDraft({ ...draft, name })}
            />
          </View>
          <View style={s.field}>
            <View style={s.row}>
              <Text style={[s.label, s.grow]}>{t('templateEditor.note')}</Text>
              <Text style={[s.small, secondary]}>
                {t('templateEditor.optional')}
              </Text>
            </View>
            <TextInput
              style={[input, s.note]}
              accessibilityLabel={t('templateEditor.note')}
              placeholder={t('templateEditor.notePlaceholder')}
              placeholderTextColor={colors.secondary}
              multiline
              maxLength={400}
              value={draft.description}
              editable={!store.busy}
              onChangeText={(description) =>
                updateDraft({ ...draft, description })
              }
            />
          </View>
          <View style={[libraryStyles.resultHeading, { marginTop: 2 }]}>
            <Text
              style={[
                libraryStyles.sectionTitle,
                { fontFamily: 'Inter_800ExtraBold' },
              ]}
            >
              {t('templateEditor.exercises')}
            </Text>
            <Text style={[s.small, secondary]}>
              {t('trainerLibrary.exercises', { count: draft.exercises.length })}
            </Text>
          </View>
          {!draft.exercises.length && (
            <View style={[s.empty, { backgroundColor: colors.sunken }]}>
              <Icon name="layers" size={32} color={colors.secondary} />
              <Text style={s.emptyTitle}>{t('templateEditor.empty')}</Text>
              <Text style={[s.emptyHint, secondary]}>
                {t('templateEditor.emptyHint')}
              </Text>
            </View>
          )}
          <View style={s.list}>
            {draft.exercises.map((e, index) => (
              <View key={e.id} style={[s.exercise, surface]}>
                <View style={s.exerciseHeading}>
                  <View
                    style={[
                      libraryStyles.order,
                      {
                        backgroundColor:
                          scheme === 'dark'
                            ? 'rgba(111,134,255,0.16)'
                            : 'rgba(43,72,214,0.1)',
                      },
                    ]}
                  >
                    <Text style={[s.small, { color: accent }]}>
                      {String(index + 1).padStart(2, '0')}
                    </Text>
                  </View>
                  <Text style={[s.exerciseTitle, s.grow]}>{e.name}</Text>
                  {iconButton('close', t('templateEditor.remove', e), () =>
                    updateDraft({
                      ...draft,
                      exercises: draft.exercises.filter((_, i) => i !== index),
                    }),
                  )}
                </View>
                <View style={s.numbers}>
                  {(['sets', 'reps', 'target', 'rest'] as const).map((key) => {
                    const label = t(
                      `templateEditor.${key === 'reps' && e.unit === 'сек' ? 'seconds' : key}`,
                    );
                    return (
                      <View style={s.grow} key={key}>
                        <Text style={[s.numberLabel, secondary]}>{label}</Text>
                        <TextInput
                          style={[
                            s.numberInput,
                            {
                              color: colors.ink,
                              backgroundColor: colors.canvas,
                              borderColor: colors.border,
                            },
                          ]}
                          accessibilityLabel={t('templateEditor.field', {
                            label,
                            name: e.name,
                          })}
                          value={e[key]}
                          maxLength={
                            key === 'reps' ? 9 : key === 'target' ? 7 : 3
                          }
                          keyboardType={
                            key === 'reps'
                              ? 'default'
                              : key === 'target'
                                ? 'decimal-pad'
                                : 'number-pad'
                          }
                          editable={!store.busy}
                          onChangeText={(value) =>
                            updateExercise(index, { [key]: value })
                          }
                        />
                      </View>
                    );
                  })}
                </View>
                <View style={s.bottom}>
                  <Text style={[s.small, secondary]}>
                    {t('templateEditor.count')}
                  </Text>
                  <Pressable
                    style={s.unit}
                    accessibilityRole="button"
                    accessibilityLabel={t('templateEditor.unit', e)}
                    accessibilityValue={{
                      text: t(
                        e.unit === 'сек'
                          ? 'templateEditor.time'
                          : 'templateEditor.repetitions',
                      ),
                    }}
                    disabled={store.busy}
                    onPress={() =>
                      updateExercise(index, {
                        unit: e.unit === 'сек' ? 'повт' : 'сек',
                      })
                    }
                  >
                    <Text style={s.small}>
                      {t(
                        e.unit === 'сек'
                          ? 'templateEditor.time'
                          : 'templateEditor.repetitions',
                      )}
                    </Text>
                    <Icon name="chevD" size={16} color={colors.secondary} />
                  </Pressable>
                  <View style={s.grow} />
                  {iconButton(
                    'chevD',
                    t('templateEditor.up', e),
                    () => move(index, -1),
                    index === 0,
                    true,
                  )}
                  {iconButton(
                    'chevD',
                    t('templateEditor.down', e),
                    () => move(index, 1),
                    index === draft.exercises.length - 1,
                  )}
                </View>
              </View>
            ))}
          </View>
          <Button
            style={s.add}
            labelStyle={s.exerciseTitle}
            variant="soft"
            label={t('templateEditor.add')}
            icon={<Icon name="plus" size={18} color={colors.ink} />}
            disabled={store.busy}
            onPress={() => {
              setQuery('');
              setSheet('picker');
            }}
          />
          <Text style={[s.storage, secondary]} accessibilityLiveRegion="polite">
            {t(
              store.status === 'error'
                ? 'templateEditor.errors.storage'
                : store.status === 'saving'
                  ? 'templateEditor.storage'
                  : edited
                    ? 'templateEditor.savedDraft'
                    : 'templateEditor.storage',
            )}
          </Text>
          {store.status === 'error' && (
            <Button
              variant="soft"
              label={t('templateEditor.retry')}
              onPress={store.retry}
            />
          )}
          {error && (
            <Text
              accessibilityRole="alert"
              style={[s.error, { color: colors.danger }]}
            >
              {t(`templateEditor.errors.${error.key}`, {
                index: (error.index ?? 0) + 1,
              })}
            </Text>
          )}
        </ScrollView>
        <View
          style={[
            s.footer,
            { borderColor: colors.border, backgroundColor: colors.canvas },
          ]}
        >
          <Text style={[s.total, secondary]}>
            {t('templateEditor.total', {
              count: draft.exercises.reduce(
                (n, e) => n + (Number(e.sets) || 0),
                0,
              ),
            })}
          </Text>
          <Button
            style={{ minHeight: 48, paddingVertical: 12 }}
            labelStyle={{ fontSize: 13, lineHeight: 18.85 }}
            label={t('templateEditor.save')}
            icon={<Icon name="check" size={18} color="#ffffff" />}
            disabled={store.busy}
            onPress={() => void save()}
          />
        </View>
      </KeyboardAvoidingView>
      <Sheet
        open={sheet === 'discard'}
        title={t('templateEditor.discardTitle')}
        onClose={() => setSheet(null)}
      >
        <Text>{t('templateEditor.discardHint')}</Text>
        <Button
          label={t('templateEditor.continueEditing')}
          onPress={() => setSheet(null)}
        />
        <Button
          variant="soft"
          label={t('templateEditor.discard')}
          disabled={store.busy}
          onPress={() =>
            void store.discard().then((ok) => {
              if (ok) {
                setSheet(null);
                onLeave();
              }
            })
          }
        />
      </Sheet>
      <Sheet
        open={sheet === 'picker'}
        title={t('templateEditor.add')}
        onClose={() => setSheet(null)}
      >
        <Text style={secondary}>{t('templateEditor.pickerHint')}</Text>
        <TextInput
          style={input}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel={t('templateEditor.search')}
          placeholder={t('templateEditor.searchPlaceholder')}
          placeholderTextColor={colors.secondary}
        />
        {!filtered.length && (
          <View style={s.empty}>
            <Text>{t('templateEditor.noResults')}</Text>
            <Text>{t('templateEditor.noResultsHint')}</Text>
          </View>
        )}
        {filtered.map((e) => {
          const selected = draft.exercises.some((x) => x.id === e.id);
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={e.name}
              accessibilityState={{ selected }}
              disabled={store.busy}
              style={[s.pickerRow, { borderColor: colors.border }]}
              onPress={() => {
                if (!selected && draft.exercises.length >= 50) {
                  toast(t('templateEditor.errors.limit'));
                  return;
                }
                updateDraft({
                  ...draft,
                  exercises: selected
                    ? draft.exercises.filter((x) => x.id !== e.id)
                    : [
                        ...draft.exercises,
                        {
                          id: e.id,
                          name: e.name,
                          sets: '3',
                          reps: e.id === 'e20' ? '30' : '10',
                          target: '',
                          rest: '90',
                          unit: e.id === 'e20' ? 'сек' : 'повт',
                        },
                      ],
                });
              }}
            >
              <View style={[s.thumb, { backgroundColor: colors.sunken }]}>
                {media[e.id] ? (
                  <Image source={media[e.id]!.image} style={s.thumb} />
                ) : (
                  <Icon name="dumbbell" size={24} color={colors.secondary} />
                )}
              </View>
              <View style={s.grow}>
                <Text style={s.exerciseTitle}>{e.name}</Text>
                <Text style={[s.small, secondary]}>{e.group}</Text>
              </View>
              <Icon
                name={selected ? 'check' : 'plus'}
                size={18}
                color={selected ? colors.accent : colors.secondary}
              />
            </Pressable>
          );
        })}
        <Button
          label={t('templateEditor.done', {
            count: t('trainerLibrary.exercises', {
              count: draft.exercises.length,
            }),
          })}
          onPress={() => setSheet(null)}
        />
      </Sheet>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1 },
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
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  title: { fontSize: 27, lineHeight: 31.05 },
  intro: { marginTop: 4, marginBottom: 24 },
  field: { marginBottom: 20 },
  label: {
    fontSize: 12,
    lineHeight: 17.4,
    fontFamily: 'Inter_700Bold',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 48,
    fontFamily: 'Inter_400Regular',
  },
  note: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'baseline' },
  grow: { flex: 1, minWidth: 0 },
  small: { fontSize: 11, lineHeight: 15.95 },
  list: { gap: 16 },
  exercise: { borderWidth: 1, borderRadius: 16, padding: 12 },
  exerciseHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  exerciseTitle: {
    fontSize: 13,
    lineHeight: 18.2,
    fontFamily: 'Inter_700Bold',
  },
  numbers: { flexDirection: 'row', gap: 8 },
  numberLabel: { fontSize: 10, lineHeight: 14.5, marginBottom: 6 },
  numberInput: {
    borderWidth: 1,
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 5,
    minHeight: 44,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    fontVariant: ['tabular-nums'],
  },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  unit: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 4 },
  empty: {
    paddingVertical: 28,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 21.75,
    fontFamily: 'Inter_700Bold',
    marginTop: 12,
    marginBottom: 8,
  },
  emptyHint: { fontSize: 12, lineHeight: 19.2, textAlign: 'center' },
  add: { marginTop: 16, minHeight: 48 },
  storage: { marginTop: 16, marginBottom: 8, fontSize: 11, lineHeight: 16.5 },
  error: { marginTop: 12, padding: 12, fontSize: 13, borderRadius: 10 },
  footer: {
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  total: {
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 11,
    lineHeight: 15.95,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

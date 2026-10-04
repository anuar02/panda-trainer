import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Field } from '@/ui/field';
import { GradientBackground } from '@/ui/gradient-background';
import { Icon } from '@/ui/icons';
import { Mascot } from '@/ui/mascot';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';

export type WorkspaceClientRow = {
  id: string;
  name: string;
  phone: string | null;
  connected: boolean;
  programName: string | null;
  nextLabel: string | null;
};

type Filter = 'all' | 'unscheduled';

export function WorkspaceClientsScreen({
  rows,
  loading,
  error,
  busy,
  onRetry,
  onAdd,
  onOpen,
  onBack,
}: {
  rows: WorkspaceClientRow[];
  loading: boolean;
  error: boolean;
  busy: boolean;
  onRetry: () => void;
  onAdd: (name: string) => Promise<void>;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  useLayoutEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const pending = useRef(false);
  const secondary = { color: colors.secondary };
  const selectedInk = scheme === 'dark' ? '#0b0c0e' : '#ffffff';
  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const phoneQuery = normalizedQuery.replace(/\D/g, '') || '!';
  const list = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            (filter === 'all' || !row.nextLabel) &&
            (!normalizedQuery ||
              row.name.toLocaleLowerCase('ru').includes(normalizedQuery) ||
              (row.phone ?? '').replace(/\D/g, '').includes(phoneQuery)),
        )
        .sort((first, second) => first.name.localeCompare(second.name, 'ru')),
    [filter, normalizedQuery, phoneQuery, rows],
  );
  const count = (value: number) =>
    t('workspaceClients.clientsCount', { count: value });
  const reset = () => {
    setQuery('');
    setFilter('all');
  };
  const closeAdd = () => {
    generation.current += 1;
    pending.current = false;
    setSaving(false);
    setAddOpen(false);
    setName('');
    setAddError('');
  };
  const openAdd = () => {
    generation.current += 1;
    pending.current = false;
    setSaving(false);
    setName('');
    setAddError('');
    setAddOpen(true);
  };
  const createClient = async () => {
    if (pending.current) return;
    const value = name.trim();
    if (!value) {
      setAddError(t('workspaceClients.nameRequired'));
      return;
    }
    const current = generation.current;
    pending.current = true;
    setSaving(true);
    setAddError('');
    try {
      await onAdd(value);
      if (generation.current === current) closeAdd();
    } catch {
      if (generation.current === current)
        setAddError(t('workspaceClients.saveError'));
    } finally {
      if (generation.current === current) {
        pending.current = false;
        setSaving(false);
      }
    }
  };
  const filters = ['all', 'due', 'unscheduled'] as const;
  const emptyTitle = error
    ? 'readError'
    : normalizedQuery
      ? 'notFound'
      : rows.length
        ? 'noResults'
        : 'first';
  const emptyHint = error
    ? 'errorHint'
    : normalizedQuery
      ? 'notFoundHint'
      : rows.length
        ? 'noResultsHint'
        : 'firstHint';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={s.root}>
      <View style={s.header}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('workspaceClients.back')}
          style={s.back}
        >
          <Icon name="chevL" size={24} color={colors.ink} />
        </Pressable>
        <View style={s.heading}>
          <Text style={s.title} accessibilityRole="header">
            {t('workspaceClients.title')}
          </Text>
          <Text style={[s.small, secondary, s.subtitle]}>
            {loading
              ? t('workspaceClients.loading')
              : error
                ? t('workspaceClients.readError')
                : t('workspaceClients.database', {
                    clients: count(rows.length),
                  })}
          </Text>
        </View>
        <Pressable
          onPress={openAdd}
          disabled={busy || saving}
          accessibilityRole="button"
          accessibilityLabel={t('workspaceClients.add')}
          accessibilityState={{ disabled: busy || saving }}
          style={[s.add, { backgroundColor: colors.ink }]}
        >
          <Icon name="plus" size={22} color={selectedInk} />
        </Pressable>
      </View>
      <View style={s.controls}>
        <View
          style={[
            s.search,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Icon name="search" size={19} color={colors.secondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            accessibilityLabel={t('workspaceClients.search')}
            placeholder={t('workspaceClients.placeholder')}
            placeholderTextColor={colors.secondary}
            style={[s.input, { color: colors.ink }]}
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel={t('workspaceClients.clear')}
              style={s.clear}
            >
              <Icon name="close" size={22} color={colors.ink} />
            </Pressable>
          )}
        </View>
        <View
          style={s.filters}
          accessibilityLabel={t('workspaceClients.filters')}
        >
          {filters.map((value) => {
            const selected = value === filter;
            const disabled = value === 'due';
            const tally =
              loading || error || disabled
                ? t('workspaceClients.dash')
                : value === 'all'
                  ? rows.length
                  : rows.filter((row) => !row.nextLabel).length;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  if (!disabled) setFilter(value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                style={[
                  s.filter,
                  {
                    backgroundColor: selected ? colors.ink : colors.surface,
                    opacity: disabled ? 0.5 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    s.small,
                    s.semibold,
                    { color: selected ? selectedInk : colors.ink },
                  ]}
                >
                  {t(`workspaceClients.${value}`)}
                </Text>
                <Text
                  style={[
                    s.small,
                    s.semibold,
                    {
                      color: selected
                        ? scheme === 'dark'
                          ? 'rgba(11,12,14,0.66)'
                          : '#ffffff'
                        : colors.secondary,
                    },
                  ]}
                >
                  {tally}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <ScrollView
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
      >
        {error && (
          <View style={[s.notice, { backgroundColor: colors.sunken }]}>
            <Icon name="wifi" size={19} color={colors.ink} />
            <Text style={[s.noticeText, s.medium]} accessibilityRole="alert">
              {t('workspaceClients.readError')}
            </Text>
            <Button
              compact
              label={t('workspaceClients.retry')}
              variant="soft"
              onPress={onRetry}
            />
          </View>
        )}
        <View style={s.listHeader}>
          <Text style={[s.small, secondary]}>
            {normalizedQuery
              ? t('workspaceClients.results')
              : t(`workspaceClients.${filter === 'all' ? 'alphabet' : filter}`)}
          </Text>
          <Text accessibilityLiveRegion="polite" style={[s.small, secondary]}>
            {loading || error ? '' : count(list.length)}
          </Text>
        </View>
        {loading ? (
          <Card
            flush
            style={s.skeletonCard}
            accessibilityRole="progressbar"
            accessibilityLabel={t('workspaceClients.loading')}
          >
            {[0, 1, 2, 3, 4].map((index) => (
              <View
                key={index}
                style={[
                  s.skeletonRow,
                  index > 0 && {
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[s.skeletonAvatar, { backgroundColor: colors.sunken }]}
                />
                <View style={s.skeletonMain}>
                  <View
                    style={[
                      s.skeletonTitle,
                      { backgroundColor: colors.sunken },
                    ]}
                  />
                  <View
                    style={[s.skeletonText, { backgroundColor: colors.sunken }]}
                  />
                </View>
              </View>
            ))}
          </Card>
        ) : list.length ? (
          <Card flush style={s.list}>
            {list.map((row, index) => {
              const initials = row.name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join('')
                .toLocaleUpperCase('ru');
              return (
                <Pressable
                  key={row.id}
                  onPress={() => onOpen(row.id)}
                  accessibilityRole="button"
                  accessibilityLabel={row.name}
                  style={[
                    s.row,
                    index > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  <View style={s.identity}>
                    <View
                      style={[s.avatar, { backgroundColor: colors.sunken }]}
                    >
                      <Text style={[s.small, s.bold]}>{initials || '?'}</Text>
                    </View>
                    <View style={s.main}>
                      <Text style={[s.name, s.bold]}>{row.name}</Text>
                      <Text style={[s.small, secondary]}>
                        {row.programName || t('workspaceClients.noProgram')}
                      </Text>
                    </View>
                  </View>
                  <View style={s.details}>
                    <Text style={[s.balance, secondary]}>
                      {t('workspaceClients.billingUnknown')}
                    </Text>
                    <View style={s.next}>
                      <Icon
                        name="calendar"
                        size={14}
                        color={colors.secondary}
                      />
                      <Text style={[s.nextText, secondary]}>
                        {row.nextLabel ?? t('workspaceClients.noNext')}
                      </Text>
                      <Icon name="chevR" size={14} color={colors.secondary} />
                    </View>
                    {!row.connected && (
                      <View style={s.flags}>
                        <Text
                          style={[
                            s.flag,
                            secondary,
                            { backgroundColor: colors.sunken },
                          ]}
                        >
                          {t('workspaceClients.disconnected')}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </Card>
        ) : (
          <Card flush style={s.empty}>
            <View style={s.mascot}>
              <View style={s.panda}>
                <GradientBackground
                  radials={[
                    {
                      color: '#ffb23d',
                      opacity: 0.35,
                      cx: 0.5,
                      cy: 0.52,
                      rx: 78.2,
                      ry: 78.2,
                    },
                    {
                      color: '#ff7a1f',
                      opacity: 0.12,
                      cx: 0.5,
                      cy: 0.52,
                      rx: 55,
                      ry: 55,
                    },
                  ]}
                />
                <Mascot pose="sit" size={170} />
              </View>
            </View>
            <Text style={s.emptyTitle}>
              {t(`workspaceClients.${emptyTitle}`)}
            </Text>
            <Text style={[s.emptyText, secondary]}>
              {t(`workspaceClients.${emptyHint}`)}
            </Text>
            <View style={s.emptyButton}>
              <Button
                compact
                label={
                  error
                    ? t('workspaceClients.retry')
                    : normalizedQuery || rows.length
                      ? t('workspaceClients.reset')
                      : t('workspaceClients.add')
                }
                variant={
                  error || normalizedQuery || rows.length ? 'soft' : 'primary'
                }
                onPress={
                  error
                    ? onRetry
                    : normalizedQuery || rows.length
                      ? reset
                      : openAdd
                }
                disabled={busy || saving}
                icon={
                  !error && !normalizedQuery && !rows.length ? (
                    <Icon name="plus" size={19} color="#ffffff" />
                  ) : undefined
                }
                style={{ opacity: 1 }}
              />
            </View>
          </Card>
        )}
      </ScrollView>
      <Sheet
        open={addOpen}
        onClose={closeAdd}
        title={t('workspaceClients.sheetTitle')}
        fixedContent={{
          header: (
            <Text style={[s.sheetNote, secondary]}>
              {t('workspaceClients.sheetNote')}
            </Text>
          ),
          footer: (
            <View style={s.sheetActions}>
              <Button
                label={t('workspaceClients.create')}
                loading={saving || busy}
                disabled={saving || busy}
                onPress={() => void createClient()}
              />
              <Button
                label={t('workspaceClients.cancel')}
                variant="ghost"
                disabled={saving || busy}
                onPress={closeAdd}
              />
            </View>
          ),
        }}
      >
        <Field
          label={t('workspaceClients.nameLabel')}
          placeholder={t('workspaceClients.namePlaceholder')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setAddError('');
          }}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={120}
          returnKeyType="done"
          onSubmitEditing={() => void createClient()}
          error={addError}
        />
      </Sheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  back: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { flex: 1 },
  title: {
    fontFamily: 'Montserrat_800ExtraBold',
    fontSize: 27,
    lineHeight: 32.4,
    letterSpacing: -0.8,
  },
  subtitle: { marginTop: 6 },
  small: { fontSize: 14, lineHeight: 20.3 },
  semibold: { fontFamily: 'Inter_600SemiBold' },
  bold: { fontFamily: 'Inter_700Bold' },
  medium: { fontFamily: 'Inter_500Medium' },
  add: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: { paddingHorizontal: 16 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20.3,
    paddingVertical: 14,
    paddingHorizontal: 0,
  },
  clear: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
  filters: { flexDirection: 'row', gap: 6, paddingTop: 14, paddingBottom: 4 },
  filter: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  body: { paddingHorizontal: 16, paddingBottom: 110 },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 18,
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
  list: { paddingHorizontal: 14, boxShadow: 'none' },
  row: { paddingVertical: 18, gap: 10 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: 4 },
  name: { fontSize: 14, lineHeight: 19.6 },
  details: { marginLeft: 48, gap: 10 },
  balance: { fontSize: 14, lineHeight: 21 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextText: { flex: 1, fontSize: 14, lineHeight: 21 },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flag: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 20.3,
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  notice: {
    marginTop: 14,
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 21 },
  empty: {
    paddingVertical: 32,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 4,
    boxShadow: 'none',
  },
  mascot: { width: 190, height: 140, marginBottom: 18 },
  panda: { position: 'absolute', width: 170, height: 170, left: 10, bottom: 0 },
  emptyTitle: {
    fontFamily: 'Montserrat_800ExtraBold',
    fontSize: 19,
    lineHeight: 27.55,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 270,
    marginTop: 6,
    textAlign: 'center',
  },
  emptyButton: { marginTop: 20, width: '100%', maxWidth: 280 },
  skeletonCard: { padding: 6 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  skeletonAvatar: { width: 42, height: 42, borderRadius: 21 },
  skeletonMain: { flex: 1, gap: 8 },
  skeletonTitle: { width: '58%', height: 14, borderRadius: 7 },
  skeletonText: { width: '34%', height: 12, borderRadius: 6 },
  sheetNote: { marginTop: 5, marginBottom: 8, lineHeight: 21 },
  sheetActions: { gap: 8 },
});

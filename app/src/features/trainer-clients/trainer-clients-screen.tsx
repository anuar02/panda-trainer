import {
  MotionHeader,
  Shimmer,
  MotionScrollView as ScrollView,
  MotionPressable as Pressable,
} from '@/ui/motion';

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { type DemoScenario } from '@/features/demo/use-demo-scenario';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icons';
import { Mascot } from '@/ui/mascot';
import { GradientBackground } from '@/ui/gradient-background';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { demoClients, filterClients, type ClientFilter } from './demo';
import { trainerClients } from './ru';

export function TrainerClientsScreen({
  scenario = 'normal',
}: {
  scenario?: DemoScenario;
}) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ClientFilter>('all');
  const tx = (key: Exclude<keyof typeof trainerClients, 'people'>) =>
    t(`trainerClients.${key}`);
  const people = scenario === 'empty' ? [] : demoClients;
  const loading = scenario === 'loading';
  const list = filterClients(people, query, filter, (person) =>
    t(`trainerClients.people.${person.id}.name`),
  );
  const filters: ClientFilter[] = ['all', 'due', 'unscheduled'];
  const count = (value: number) =>
    t('trainerClients.clients', { count: value });
  const secondary = { color: colors.secondary };
  const selectedInk = scheme === 'dark' ? '#0b0c0e' : '#ffffff';
  const reset = () => {
    setQuery('');
    setFilter('all');
  };
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`trainer-clients-${scenario}`}
    >
      <MotionHeader motionKey={scenario} style={s.header}>
        <View>
          <Text style={s.title}>{tx('title')}</Text>
          <Text style={[s.small, secondary, s.subtitle]}>
            {loading
              ? tx('loading')
              : t('trainerClients.database', { clients: count(people.length) })}
          </Text>
        </View>
        <Pressable
          disabled
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          accessibilityLabel={tx('add')}
          style={[s.add, { backgroundColor: colors.ink }]}
        >
          <Icon name="plus" size={22} color={selectedInk} />
        </Pressable>
      </MotionHeader>
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
            accessibilityLabel={tx('search')}
            placeholder={tx('placeholder')}
            placeholderTextColor={colors.secondary}
            style={[s.input, { color: colors.ink }]}
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel={tx('clear')}
              style={s.clear}
            >
              <Icon name="close" size={22} color={colors.ink} />
            </Pressable>
          )}
        </View>
        <View style={s.filters} accessibilityLabel={tx('filters')}>
          {filters.map((value) => (
            <Pressable
              motionKind="chip"
              key={value}
              onPress={() => setFilter(value)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === value }}
              style={[
                s.filter,
                {
                  backgroundColor:
                    filter === value ? colors.ink : colors.surface,
                },
              ]}
            >
              <Text
                style={[
                  s.small,
                  s.semibold,
                  { color: filter === value ? selectedInk : colors.ink },
                ]}
              >
                {tx(value)}
              </Text>
              <Text
                style={[
                  s.small,
                  s.semibold,
                  {
                    color:
                      filter === value
                        ? scheme === 'dark'
                          ? 'rgba(11,12,14,0.66)'
                          : '#ffffff'
                        : colors.secondary,
                  },
                ]}
              >
                {loading
                  ? tx('dash')
                  : value === 'all'
                    ? people.length
                    : people.filter((person) =>
                        value === 'due' ? person.due > 0 : !person.next,
                      ).length}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView
        motionKey={scenario}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
      >
        {scenario === 'offline' && (
          <View style={[s.notice, { backgroundColor: colors.sunken }]}>
            <Icon name="wifi" size={19} color={colors.ink} />
            <Text style={[s.noticeText, s.medium]}>{tx('offline')}</Text>
          </View>
        )}
        <View style={s.listHeader}>
          <Text style={[s.small, secondary]}>
            {query.trim()
              ? tx('results')
              : tx(filter === 'all' ? 'alphabet' : filter)}
          </Text>
          <Text accessibilityLiveRegion="polite" style={[s.small, secondary]}>
            {loading ? '' : count(list.length)}
          </Text>
        </View>
        {loading ? (
          <Card
            flush
            style={s.skeletonCard}
            accessibilityRole="progressbar"
            accessibilityLabel={tx('loading')}
          >
            {[0, 1, 2, 3, 4].map((index) => (
              <View
                key={index}
                style={[
                  s.skeletonRow,
                  index > 0 && {
                    borderTopWidth: 1,
                    borderTopColor: scheme === 'dark' ? '#212227' : '#efefeb',
                  },
                ]}
              >
                <Shimmer
                  style={[s.skeletonAvatar, { backgroundColor: colors.sunken }]}
                />
                <View style={s.skeletonMain}>
                  <Shimmer
                    style={[
                      s.skeletonTitle,
                      { backgroundColor: colors.sunken },
                    ]}
                  />
                  <Shimmer
                    style={[s.skeletonText, { backgroundColor: colors.sunken }]}
                  />
                </View>
              </View>
            ))}
          </Card>
        ) : list.length ? (
          <Card rows flush style={s.list}>
            {list.map((person, index) => (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/client/[id]',
                    params: { id: person.id },
                  })
                }
                key={person.id}
                accessibilityRole="button"
                accessibilityLabel={t(
                  `trainerClients.people.${person.id}.name`,
                )}
                style={[
                  s.row,
                  index > 0 && {
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <View style={s.identity}>
                  <View style={[s.avatar, { backgroundColor: colors.sunken }]}>
                    <Text style={[s.small, s.bold]}>
                      {t(`trainerClients.people.${person.id}.initials`)}
                    </Text>
                  </View>
                  <View style={s.main}>
                    <Text style={[s.name, s.bold]}>
                      {t(`trainerClients.people.${person.id}.name`)}
                    </Text>
                    <Text style={[s.small, secondary]}>
                      {t(`trainerClients.people.${person.id}.program`)}
                    </Text>
                  </View>
                </View>
                <View style={s.details}>
                  <Text style={[s.balance, secondary]}>
                    {person.remaining === null ? (
                      tx('noPlan')
                    ) : (
                      <>
                        {tx('remaining')}{' '}
                        <Text style={[s.balance, s.bold]}>
                          {person.remaining}
                        </Text>{' '}
                        {t('trainerClients.sessions', {
                          count: person.remaining,
                        })}
                      </>
                    )}
                  </Text>
                  <View style={s.next}>
                    <Icon name="calendar" size={14} color={colors.secondary} />
                    <Text style={[s.nextText, secondary]}>
                      {person.next
                        ? t(
                            `trainerClients.${person.next.group ? 'nextGroup' : 'next'}`,
                            {
                              date: tx(person.next.date),
                              time: person.next.time,
                            },
                          )
                        : tx('noNext')}
                    </Text>
                    <Icon name="chevR" size={14} color={colors.secondary} />
                  </View>
                  {(person.due > 0 || person.id === 'c6') && (
                    <View style={s.flags}>
                      {person.due > 0 && (
                        <Text
                          style={[
                            s.flag,
                            {
                              color: scheme === 'dark' ? '#f5c451' : '#85560a',
                              backgroundColor:
                                scheme === 'dark'
                                  ? 'rgba(245,196,81,0.14)'
                                  : 'rgba(255,178,61,0.2)',
                            },
                          ]}
                        >
                          {t('trainerClients.payment', {
                            amount: new Intl.NumberFormat('ru-RU').format(
                              person.due,
                            ),
                          })}
                        </Text>
                      )}
                      {person.id === 'c6' && (
                        <Text
                          style={[
                            s.flag,
                            secondary,
                            { backgroundColor: colors.sunken },
                          ]}
                        >
                          {tx('disconnected')}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
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
                <Mascot pose="sit" clipPlace="empty" size={170} />
              </View>
            </View>
            <Text style={s.emptyTitle}>
              {tx(
                query.trim()
                  ? 'notFound'
                  : people.length
                    ? 'noResults'
                    : 'first',
              )}
            </Text>
            <Text style={[s.emptyText, secondary]}>
              {tx(
                query.trim()
                  ? 'notFoundHint'
                  : people.length
                    ? 'noResultsHint'
                    : 'firstHint',
              )}
            </Text>
            <View style={s.emptyButton}>
              <Button
                compact
                label={tx(people.length ? 'reset' : 'add')}
                variant={people.length ? 'soft' : 'primary'}
                onPress={people.length ? reset : undefined}
                disabled={!people.length}
                icon={
                  !people.length ? (
                    <Icon name="plus" size={19} color="#ffffff" />
                  ) : undefined
                }
                style={{ opacity: 1 }}
              />
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingTop: 10,
    paddingHorizontal: 22,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
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
  skeletonMain: { flex: 1 },
  skeletonTitle: { width: '60%', height: 14, borderRadius: 10 },
  skeletonText: {
    width: '40%',
    height: 12,
    borderRadius: 10,
    marginTop: 8,
  },
});

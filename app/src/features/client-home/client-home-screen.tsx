import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { GradientBackground } from '@/ui/gradient-background';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icons';
import { Mascot } from '@/ui/mascot';
import { Sheet } from '@/ui/sheet';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { homeBookings, homePackage, type HomeScenario } from './fixtures';
import { styles as s } from './styles';
import type { clientHome } from './ru';

export function ClientHomeScreen({
  scenario = 'normal',
}: {
  scenario?: HomeScenario;
}) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const hair = scheme === 'light' ? '#efefeb' : '#212227';
  const warningBackground =
    scheme === 'light' ? 'rgba(255, 178, 61, 0.2)' : 'rgba(245, 196, 81, 0.14)';
  const [cancelled, setCancelled] = useState<string[]>([]);
  const [requestActive, setRequestActive] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const bookings = homeBookings.filter(
    (booking) => !cancelled.includes(booking.id),
  );
  const next = bookings[0];
  const empty = scenario === 'empty' || !next;
  const transfer =
    requestActive && bookings.some((booking) => booking.id === 's8');
  const tx = (key: keyof typeof clientHome) => t(`clientHome.${key}`);
  const requestCard = (
    <View
      style={[
        s.request,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={s.requestLabel}>
        <Icon name="swap" size={14} color={colors.warning} />
        <Text
          className="font-bold"
          style={[s.small, { color: colors.warning }]}
        >
          {tx('transfer')}
        </Text>
      </View>
      <View style={s.dates}>
        <View style={s.dateColumn}>
          <Text className="text-secondary" style={s.small}>
            {tx('current')}
          </Text>
          <Text style={s.small}>{tx('futureShort')}</Text>
          <Text className="font-strong" style={s.small}>
            {tx('currentTime')}
          </Text>
        </View>
        <Icon name="arrowRight" size={18} color={colors.ink} />
        <View style={s.dateColumn}>
          <Text className="text-secondary" style={s.small}>
            {tx('proposed')}
          </Text>
          <Text style={s.small}>{tx('proposedDate')}</Text>
          <Text className="font-strong" style={s.small}>
            {tx('proposedTime')}
          </Text>
        </View>
      </View>
      <Text className="text-secondary" style={s.waiting}>
        {tx('waiting')}
      </Text>
      <View style={s.requestAction}>
        <Button
          label={tx('withdraw')}
          variant="soft"
          compact
          onPress={() => setRequestActive(false)}
        />
      </View>
    </View>
  );
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`client-home-${scenario}`}
    >
      <View style={s.topbar}>
        <View style={s.trainer}>
          <View style={s.avatar}>
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
            accessibilityLabel={tx('loading')}
            accessible
            accessibilityRole="progressbar"
          >
            <Card flush style={s.skeletonCard}>
              {[0, 1, 2, 3].map((row) => (
                <View
                  key={row}
                  style={[
                    s.skeletonRow,
                    row > 0 && { borderTopWidth: 1, borderTopColor: hair },
                  ]}
                >
                  <View
                    style={[
                      s.skeletonCircle,
                      { backgroundColor: colors.sunken },
                    ]}
                  />
                  <View style={s.skeletonMain}>
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
        ) : empty ? (
          <>
            <Text accessibilityRole="header" style={s.title}>
              {tx('greeting')}
            </Text>
            <View style={s.page}>
              <View style={s.empty}>
                <Mascot
                  pose="sit"
                  size={170}
                  style={s.emptyMascot}
                  resizeMode="contain"
                  accessible={false}
                />
                <Text style={s.emptyTitle}>{tx('empty')}</Text>
                <Text className="text-secondary" style={s.emptyHint}>
                  {tx('emptyHint')}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={[s.encouragement, { color: colors.accent }]}>
              {tx(next.today ? 'encouragement' : 'soon')}
            </Text>
            <Text accessibilityRole="header" style={s.title}>
              {tx('greeting')}
            </Text>
            {scenario === 'offline' && (
              <View
                style={[s.notice, { backgroundColor: warningBackground }]}
                accessibilityRole="alert"
              >
                <Icon name="wifioff" color={colors.warning} size={18} />
                <Text style={[s.noticeText, { color: colors.warning }]}>
                  {tx('offline')}
                </Text>
              </View>
            )}
            <View style={s.page}>
              <Card flush>
                <View style={s.hero}>
                  <GradientBackground
                    radius={24}
                    radials={[
                      {
                        color: '#e0561b',
                        opacity: 0.14,
                        cx: 1.1,
                        cy: 0,
                        rx: 260,
                        ry: 200,
                        stop: 0.7,
                      },
                      {
                        color: '#ffb23d',
                        opacity: 0.22,
                        cx: 1,
                        cy: 0.3,
                        rx: 220,
                        ry: 160,
                        stop: 0.7,
                      },
                    ]}
                  />
                  <Mascot
                    pose={next.id === 's8' && transfer ? 'clipboard' : 'wave'}
                    size={92}
                    style={s.mascot}
                    resizeMode="contain"
                    accessible={false}
                  />
                  <View style={s.top}>
                    <Text
                      className="font-strong text-secondary"
                      style={s.small}
                    >
                      {tx(next.today ? 'today' : 'next')}
                    </Text>
                    <StatusPill
                      label={tx(
                        next.id === 's8' && transfer
                          ? 'hasTransfer'
                          : 'confirmed',
                      )}
                      tone={
                        next.id === 's8' && transfer ? 'warning' : 'success'
                      }
                    />
                  </View>
                  <Text
                    className="font-medium text-secondary"
                    style={[s.small, s.date]}
                  >
                    {tx(next.dateKey)}
                  </Text>
                  <Text style={s.when}>
                    {t('clientHome.timeStart', { start: next.start })}
                    <Text style={[s.when, s.end]}>{next.end}</Text>
                  </Text>
                  <View style={s.meta}>
                    <Text style={s.program}>{tx(next.programKey)}</Text>
                    <Text className="text-secondary" style={s.small}>
                      {tx('individual')}
                    </Text>
                  </View>
                  {next.id === 's8' && transfer && (
                    <View style={s.requestAction}>{requestCard}</View>
                  )}
                  <View style={s.actions}>
                    {!(next.id === 's8' && transfer) && (
                      <Button
                        label={tx('propose')}
                        variant="soft"
                        compact
                        disabled
                        icon={<Icon name="swap" size={18} color={colors.ink} />}
                      />
                    )}
                    <Button
                      label={tx('cancel')}
                      variant="ghost"
                      compact
                      onPress={() => setCancelOpen(true)}
                    />
                  </View>
                </View>
              </Card>
            </View>
            {transfer && next.id !== 's8' && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>{tx('transfers')}</Text>
                {requestCard}
              </View>
            )}
            <View style={s.packageSection}>
              <Card flush>
                <View style={s.package}>
                  <View style={s.packageHeading}>
                    <Text className="font-strong" style={s.small}>
                      {tx('balance')}
                    </Text>
                    <Text className="text-secondary" style={s.small}>
                      {tx('package')}
                    </Text>
                  </View>
                  <View style={s.value}>
                    <Text style={s.number}>{homePackage.remaining}</Text>
                    <Text className="text-secondary" style={s.small}>
                      {t('clientHome.units', { count: homePackage.bought })}
                    </Text>
                  </View>
                  <View style={[s.meter, { backgroundColor: colors.sunken }]}>
                    <View
                      style={[
                        s.meterFill,
                        {
                          width: `${(homePackage.remaining / homePackage.bought) * 100}%`,
                          backgroundColor: colors.accent,
                        },
                      ]}
                    />
                  </View>
                  <View style={s.due}>
                    <StatusPill label={tx('due')} tone="warning" />
                  </View>
                </View>
              </Card>
            </View>
            {bookings.length > 1 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>{tx('upcoming')}</Text>
                <Card flush>
                  <View style={s.upcoming}>
                    <Text style={s.rowTitle}>{tx('upcomingTime')}</Text>
                    <Text
                      className="font-medium text-secondary"
                      style={s.rowMeta}
                    >
                      {tx('program')}
                    </Text>
                  </View>
                </Card>
              </View>
            )}
            <View style={s.history}>
              <Button
                label={tx('history')}
                variant="soft"
                icon={<Icon name="list" color={colors.ink} size={18} />}
                onPress={() => router.push('./history')}
              />
            </View>
          </>
        )}
      </ScrollView>
      <Sheet
        open={cancelOpen}
        title={tx('cancelTitle')}
        onClose={() => setCancelOpen(false)}
      >
        {next && (
          <Text>
            {t('clientHome.bookingSummary', {
              date: tx(next.dateKey),
              start: next.start,
              end: next.end,
            })}
          </Text>
        )}
        <Text className="text-secondary">{tx('cancelHint')}</Text>
        <Button
          label={tx('cancel')}
          variant="danger"
          onPress={() => {
            if (next) setCancelled((ids) => [...ids, next.id]);
            setCancelOpen(false);
          }}
        />
        <Button
          label={tx('keep')}
          variant="soft"
          onPress={() => setCancelOpen(false)}
        />
      </Sheet>
    </SafeAreaView>
  );
}

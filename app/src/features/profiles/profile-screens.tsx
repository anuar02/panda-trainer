import { useTabContentBottomInset } from '@/features/navigation/tab-bar-layout';
import {
  GrowX,
  Shimmer,
  MotionScrollView as ScrollView,
  MotionPressable as Pressable,
} from '@/ui/motion';

import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import { Icon } from '@/ui/icons';
import { GradientBackground } from '@/ui/gradient-background';
import { useTheme } from '@/ui/theme';
import { useCalmModePreference } from '@/ui/calm-mode';
import type { DemoScenario } from '@/features/demo/use-demo-scenario';
import { styles as s } from './styles';
import type { profiles } from './ru';

function useProfileText() {
  const { t } = useTranslation();
  return (key: keyof typeof profiles) => t(`profiles.${key}`);
}

function Lead({
  trainer = false,
  small = false,
  icon,
  children,
}: {
  trainer?: boolean;
  small?: boolean;
  icon?: 'layers' | 'dumbbell' | 'wallet' | 'bell';
  children?: string;
}) {
  const { scheme } = useTheme();
  const dark = scheme === 'dark';
  const color = trainer ? '#ffffff' : dark ? '#aab8ff' : '#2238b0';
  return (
    <View style={[s.lead, small && s.leadSmall]}>
      <GradientBackground
        start={
          trainer
            ? dark
              ? '#26272e'
              : '#262b45'
            : dark
              ? '#232845'
              : '#e3e8fd'
        }
        end={
          trainer
            ? dark
              ? '#18191d'
              : '#141726'
            : dark
              ? '#1b1f36'
              : '#d3dbfb'
        }
        radius={small ? 17 : 21}
      />
      {icon ? (
        <View>
          <Icon name={icon} size={20} color={color} />
        </View>
      ) : (
        <Text style={[s.leadText, { color }]}>{children}</Text>
      )}
    </View>
  );
}

export function ProfilePreferences() {
  const tx = useProfileText();
  const { colors, appearance, setAppearance } = useTheme();
  const { calmMode, setCalmMode, error } = useCalmModePreference();
  const surface = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };
  return (
    <View>
      <Pressable
        onPress={() => setCalmMode(!calmMode)}
        accessibilityRole="switch"
        accessibilityLabel={tx('calm')}
        accessibilityState={{ checked: calmMode }}
        aria-checked={calmMode}
        style={[s.preference, surface]}
      >
        <Text style={s.preferenceLabel}>{tx('calm')}</Text>
        <View
          style={[
            s.track,
            { backgroundColor: calmMode ? colors.accent : colors.secondary },
          ]}
        >
          <View
            style={[
              s.thumb,
              {
                backgroundColor: colors.surface,
                alignSelf: calmMode ? 'flex-end' : 'flex-start',
              },
            ]}
          />
        </View>
      </Pressable>
      {error && <Text accessibilityRole="alert">{tx('calmSaveError')}</Text>}
      <View
        style={[s.preference, s.theme, surface]}
        accessibilityLabel={tx('theme')}
      >
        <Text>{tx('theme')}</Text>
        <View style={[s.segments, { backgroundColor: colors.sunken }]}>
          {(['auto', 'dark', 'light'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: appearance === value }}
              onPress={() => setAppearance(value)}
              style={[
                s.segment,
                appearance === value && {
                  backgroundColor: colors.surface,
                  boxShadow: `inset 0 0 0 1px ${colors.control}`,
                },
              ]}
            >
              <Text
                style={[
                  s.segmentLabel,
                  {
                    color: appearance === value ? colors.ink : colors.secondary,
                  },
                ]}
              >
                {tx(value)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function RoleSwitch() {
  const { t } = useTranslation();
  return (
    <View style={s.roleSwitch}>
      <Button
        label={t('common.backToRoles')}
        variant="ghost"
        onPress={() => router.replace('/demo')}
      />
    </View>
  );
}

export function TrainerProfileScreen({
  scenario = 'normal',
}: {
  scenario?: DemoScenario;
}) {
  const paddingBottom = useTabContentBottomInset(20);
  const tx = useProfileText();
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const rows = [
    { icon: 'layers', title: 'library' },
    { icon: 'dumbbell', title: 'exercises' },
    { icon: 'wallet', title: 'billing' },
    { icon: 'bell', title: 'notifications' },
  ] as const;
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`trainer-profile-${scenario}`}
    >
      <View style={s.trainerHeader}>
        <Text style={s.trainerTitle}>{tx('title')}</Text>
      </View>
      <ScrollView
        motionKey={scenario}
        contentContainerStyle={[s.trainerBody, { paddingBottom }]}
      >
        <View style={s.trainerPerson}>
          <Lead trainer>{tx('trainerInitials')}</Lead>
          <View style={s.personText}>
            <Text style={s.trainerName}>{tx('trainer')}</Text>
            <Text style={[s.occupation, { color: colors.secondary }]}>
              {tx('occupation')}
            </Text>
          </View>
        </View>
        <View style={s.stats}>
          {(
            [
              ['7', 'today'],
              ['2', 'awaiting'],
              ['6', 'clients'],
            ] as const
          ).map(([value, label]) => (
            <Card key={label} flush style={s.stat}>
              <Text style={s.statValue}>{value}</Text>
              <Text style={[s.statLabel, { color: colors.secondary }]}>
                {tx(label)}
              </Text>
            </Card>
          ))}
        </View>
        <Card rows flush style={s.rows}>
          {rows.map((row, index) => (
            <Pressable
              key={row.title}
              disabled={row.title !== 'library'}
              accessibilityRole="button"
              accessibilityLabel={tx(row.title)}
              accessibilityState={{ disabled: row.title !== 'library' }}
              accessibilityHint={
                row.title !== 'library' ? tx('unavailable') : undefined
              }
              onPress={() => router.push('/(trainer)/library')}
              style={[
                s.row,
                index > 0 && {
                  borderTopWidth: 1,
                  borderTopColor: scheme === 'dark' ? '#212227' : '#efefeb',
                },
              ]}
            >
              <Lead small icon={row.icon} />
              <Text style={s.rowTitle}>{tx(row.title)}</Text>
              <Icon
                name="chevR"
                size={20}
                color={scheme === 'dark' ? '#84858d' : '#9a9ca6'}
              />
            </Pressable>
          ))}
        </Card>
        <ProfilePreferences />
        <Text className="text-secondary">{t('accountExport.demo')}</Text>
        <Button
          label={t('accountExport.title')}
          variant="secondary"
          onPress={() => router.push('/auth/account')}
        />
        <RoleSwitch />
      </ScrollView>
    </SafeAreaView>
  );
}

export function ClientProfileScreen({
  scenario = 'normal',
}: {
  scenario?: DemoScenario;
}) {
  const paddingBottom = useTabContentBottomInset(20);
  const tx = useProfileText();
  const { colors, scheme } = useTheme();
  const secondary = { color: colors.secondary };
  const hair = scheme === 'dark' ? '#212227' : '#efefeb';
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.root}
      testID={`client-profile-${scenario}`}
    >
      <View style={s.clientTopbar}>
        <View style={s.chip}>
          <View style={s.chipAvatar}>
            <GradientBackground start="#262b45" end="#141726" radius={16} />
            <Text style={s.chipInitials}>{tx('trainerInitials')}</Text>
          </View>
          <View>
            <Text className="font-medium" style={[s.chipText, secondary]}>
              {tx('trainerLabel')}
            </Text>
            <Text className="font-bold" style={s.chipText}>
              {tx('trainerShort')}
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
          <Icon name="bell" size={22} color={colors.ink} />
        </Pressable>
      </View>
      <ScrollView
        motionKey={scenario}
        contentContainerStyle={[s.body, { paddingBottom }]}
      >
        {scenario === 'loading' ? (
          <View
            style={s.clientContent}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={tx('loading')}
          >
            <Card flush style={s.skeletonRows}>
              {[0, 1, 2, 3].map((index) => (
                <View
                  key={index}
                  style={[
                    s.skeletonRow,
                    index > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: 'transparent',
                    },
                  ]}
                >
                  <View style={[s.lead, { backgroundColor: colors.sunken }]} />
                  <View style={s.skeletonLines}>
                    <Shimmer
                      style={[
                        s.skeletonLine,
                        { backgroundColor: colors.sunken },
                      ]}
                    />
                    <View
                      style={[
                        s.skeletonShort,
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
                      scheme === 'dark'
                        ? 'rgba(245,196,81,0.14)'
                        : 'rgba(255,178,61,0.2)',
                  },
                ]}
              >
                {tx('offline')}
              </Text>
            )}
            <Text style={s.title}>{tx('title')}</Text>
            <View style={s.clientContent}>
              <View style={s.clientPerson}>
                <Lead>{tx('clientInitials')}</Lead>
                <View style={s.personText}>
                  <Text style={s.clientName}>{tx('client')}</Text>
                  <Text style={[s.small, s.since, secondary]}>
                    {tx('since')}
                  </Text>
                </View>
              </View>
              <View style={s.section}>
                <Text style={s.sectionTitle}>{tx('personal')}</Text>
                <Card flush style={s.details}>
                  <View>
                    <Text style={[s.detailLabel, secondary]}>
                      {tx('phoneLabel')}
                    </Text>
                    <Text style={s.detailValue}>{tx('phone')}</Text>
                  </View>
                  <View>
                    <Text style={[s.detailLabel, secondary]}>
                      {tx('coach')}
                    </Text>
                    <Text style={s.detailValue}>{tx('trainer')}</Text>
                  </View>
                </Card>
              </View>
              <View style={s.section}>
                <Text style={s.sectionTitle}>{tx('packageLabel')}</Text>
                {scenario === 'empty' ? (
                  <Card flush style={s.empty}>
                    <Lead icon="wallet" />
                    <Text style={s.emptyTitle}>{tx('empty')}</Text>
                    <Text style={[s.emptyHint, secondary]}>
                      {tx('emptyHint')}
                    </Text>
                  </Card>
                ) : (
                  <Card flush style={s.package}>
                    <Text style={s.packageTitle}>{tx('package')}</Text>
                    <View style={s.packageValue}>
                      <Text style={s.remaining}>{7}</Text>
                      <Text style={[s.small, secondary]}>
                        {tx('remaining')}
                      </Text>
                    </View>
                    <View style={[s.meter, { backgroundColor: colors.sunken }]}>
                      <GrowX style={s.meterValue}>
                        <GradientBackground
                          start="#7b8ff5"
                          end="#2b48d6"
                          radius={4}
                        />
                      </GrowX>
                    </View>
                    <View style={[s.payment, { borderTopColor: hair }]}>
                      <Text style={[s.detailLabel, secondary]}>
                        {tx('dueLabel')}
                      </Text>
                      <Text style={s.amount}>{tx('due')}</Text>
                    </View>
                    <Text style={[s.footnote, secondary]}>{tx('payment')}</Text>
                  </Card>
                )}
              </View>
              <View style={s.section}>
                <Text style={s.sectionTitle}>{tx('settings')}</Text>
                <ProfilePreferences />
              </View>
              <View style={s.notifications}>
                <Button
                  disabled
                  label={tx('notifications')}
                  variant="secondary"
                  icon={<Icon name="bell" size={20} color={colors.ink} />}
                />
              </View>
              <RoleSwitch />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

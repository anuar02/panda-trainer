import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { Button } from '@/ui/button';
import { StatusPill } from '@/ui/status-pill';
import { useTheme } from '@/ui/theme';
import { formatFinancialTotal } from '../trainer-billing/financial-summary';
import { useClientProgress } from '../client-progress/use-progress';
import { clientHistoryProgress } from '../client-progress/adapter';
import { clientProgressWeek } from '../client-progress/period';
import { useClientOverview } from './use-overview';
import { styles as s } from './styles';

export function ClientHomeFacts(props: {
  userId: string;
  workspaceId: string;
  clientRecordId: string;
  timezone: string;
  now: Date;
  onOpenProgress: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const week = clientProgressWeek(props.now, props.timezone);
  const overview = useClientOverview({
    expectedUserId: props.userId,
    workspaceId: props.workspaceId,
    clientRecordId: props.clientRecordId,
    startsOn: week.startsOn,
    endsOn: week.endsOn,
  });
  const history = useClientProgress(props);
  const progress = history.data
    ? clientHistoryProgress(history.data, props.now)
    : null;
  const failed =
    overview.error || history.error || (progress && !progress.complete);
  if (failed)
    return (
      <View style={s.section}>
        <Text accessibilityRole="alert">{t('common.error')}</Text>
        <Button
          label={t('common.retry')}
          onPress={() => {
            overview.retry();
            history.retry();
          }}
        />
      </View>
    );
  if (overview.loading || history.loading)
    return (
      <View style={s.section}>
        <Text accessibilityRole="progressbar">{t('common.loading')}</Text>
      </View>
    );
  const totals = overview.data;
  if (!totals) return null;
  const number = (value: string) =>
    new Intl.NumberFormat(i18n.language).format(BigInt(value));
  const best = progress?.results[0];
  return (
    <>
      <View style={s.packageSection}>
        <Card flush>
          <View style={s.package}>
            <View style={s.packageHeading}>
              <Text className="font-strong" style={s.small}>
                {t('clientHome.balance')}
              </Text>
              <Text className="text-secondary" style={s.small}>
                {t('clientHome.packages')}
              </Text>
            </View>
            <View style={s.value}>
              <Text style={s.number}>{number(totals.remainingUnits)}</Text>
              <Text className="text-secondary" style={s.small}>
                {t('clientHome.activeUnits', {
                  units: number(totals.activeUnits),
                })}
              </Text>
            </View>
            <View style={[s.meter, { backgroundColor: colors.sunken }]}>
              <View
                style={[
                  s.meterFill,
                  {
                    width: `${totals.activeUnits === '0' ? 0 : Number((BigInt(totals.remainingUnits) * 10000n) / BigInt(totals.activeUnits)) / 100}%`,
                    backgroundColor: colors.accent,
                  },
                ]}
              />
            </View>
            <View style={s.due}>
              <StatusPill
                label={t('clientHome.serverDue', {
                  amount: formatFinancialTotal(totals.dueMinor, i18n.language),
                })}
                tone={totals.dueMinor === '0' ? 'success' : 'warning'}
              />
            </View>
          </View>
        </Card>
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t('clientProgress.title')}</Text>
        <Card>
          <Text>{best?.name ?? t('clientProgress.emptyTitle')}</Text>
          {best ? (
            <Text>
              {t(
                `clientProgress.${best.best.kg ? 'weightedBest' : 'unweightedBest'}`,
                {
                  weight: new Intl.NumberFormat(i18n.language, {
                    maximumFractionDigits: 3,
                  }).format(best.best.kg),
                  reps: best.best.reps,
                  unit: best.unit,
                },
              )}
            </Text>
          ) : (
            <Text className="text-secondary">
              {t('clientProgress.emptyText')}
            </Text>
          )}
          <Button
            label={t('clientProgress.title')}
            variant="soft"
            onPress={props.onOpenProgress}
          />
        </Card>
      </View>
    </>
  );
}

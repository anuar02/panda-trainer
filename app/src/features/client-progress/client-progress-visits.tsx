import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { parity } from '@/ui/parity-tokens';
import { useClientOverview } from '../client-home/use-overview';
import { clientProgressWeek } from './period';
import { styles as s } from './styles';

export function ClientProgressVisits(props: {
  userId: string;
  workspaceId: string;
  clientRecordId: string;
  timezone: string;
  now: Date;
  offset: number;
  onOffset: (offset: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const week = clientProgressWeek(props.now, props.timezone, props.offset);
  const read = useClientOverview({
    expectedUserId: props.userId,
    workspaceId: props.workspaceId,
    clientRecordId: props.clientRecordId,
    startsOn: week.startsOn,
    endsOn: week.endsOn,
  });
  const label = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`));
  return (
    <View style={s.visits}>
      <Text accessibilityRole="header" style={s.sectionTitle}>
        {t('clientProgress.visitsTitle')}
      </Text>
      <View className="flex-row items-center gap-2">
        <Button
          label={t('clientProgress.previousWeek')}
          variant="ghost"
          onPress={() => props.onOffset(props.offset - 1)}
        />
        <Text>
          {t('clientProgress.period', {
            start: label(week.days[0]!),
            end: label(week.days[6]!),
          })}
        </Text>
        <Button
          label={t('clientProgress.nextWeek')}
          variant="ghost"
          disabled={props.offset >= 0}
          onPress={() => props.onOffset(props.offset + 1)}
        />
      </View>
      {read.error ? (
        <>
          <Text accessibilityRole="alert">{t('common.error')}</Text>
          <Button label={t('common.retry')} onPress={read.retry} />
        </>
      ) : read.loading ? (
        <Text accessibilityRole="progressbar">{t('common.loading')}</Text>
      ) : (
        <Card rows flush style={s.visitsCard}>
          <View style={s.week}>
            {week.days.map((date) => {
              const count =
                read.data?.visits.find((v) => v.date === date)?.count ?? '0';
              return (
                <View key={date} style={s.column}>
                  <Text style={[s.weekday, { color: colors.secondary }]}>
                    {new Intl.DateTimeFormat(i18n.language, {
                      weekday: 'short',
                      timeZone: 'UTC',
                    }).format(new Date(`${date}T12:00:00Z`))}
                  </Text>
                  <View
                    accessible
                    accessibilityLabel={t('clientProgress.visitDay', {
                      date: label(date),
                      count,
                    })}
                    style={[
                      s.day,
                      count !== '0'
                        ? {
                            backgroundColor:
                              parity[scheme].success.backgroundColor,
                          }
                        : undefined,
                    ]}
                  >
                    <Text
                      style={[
                        s.dayText,
                        count !== '0'
                          ? {
                              color: parity[scheme].success.color,
                              fontFamily: 'Inter_700Bold',
                            }
                          : { color: colors.secondary },
                      ]}
                    >
                      {Number(date.slice(8))}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={[s.footnote, { color: colors.secondary }]}>
            {t(
              read.data?.visits.length
                ? 'clientProgress.confirmedVisits'
                : 'clientProgress.visitsFootnote',
            )}
          </Text>
        </Card>
      )}
    </View>
  );
}

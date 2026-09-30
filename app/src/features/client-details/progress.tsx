import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import type { WorkoutSession, WorkoutState } from '@/domain/workout';
import type { DemoClient } from '@/features/trainer-clients/demo';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { detailsHistory, type DetailsRecord } from './fixtures';
import { styles as s } from './styles';

export function DetailsProgress({
  clientId,
  sessions,
  workoutState,
  empty,
}: {
  clientId: DemoClient['id'];
  sessions: readonly WorkoutSession[];
  workoutState?: WorkoutState;
  empty: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const current: DetailsRecord[] = sessions.flatMap((session) => {
    const journal = workoutState?.sessions[session.id];
    const participant = session.participants.find(
      (person) => person.clientId === clientId,
    );
    if (
      !journal?.finished ||
      !participant ||
      participant.reply === 'cancelled' ||
      session.date > '2026-09-14'
    )
      return [];
    return (journal.plans[clientId]?.exercises ?? []).flatMap((exercise) => {
      const values = (journal.values[clientId]?.[exercise.id] ?? []).filter(
        (value) => value !== null,
      );
      if (!values.length) return [];
      const weighted = values.some((value) => value.kg > 0);
      return [
        {
          exercise: exercise.name,
          date: session.date,
          sets: values.length,
          top: Math.max(
            ...values.map((value) => (weighted ? value.kg : value.reps)),
          ),
          unit: weighted ? 'кг' : exercise.unit,
        },
      ];
    });
  });
  const history = empty
    ? []
    : [...(detailsHistory[clientId] ?? []), ...current];
  const names = [...new Set(history.map((entry) => entry.exercise))];
  const exercise = selected && names.includes(selected) ? selected : names[0];
  const rows = history
    .filter((entry) => entry.exercise === exercise)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = rows[0];
  const last = rows[rows.length - 1];
  const secondary = { color: colors.secondary };
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language).format(value);
  const months = t('trainerSchedule.monthsShort', { returnObjects: true });
  const date = (value: string, long = false) =>
    long
      ? new Intl.DateTimeFormat(i18n.language, {
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        }).format(new Date(`${value}T12:00:00Z`))
      : `${Number(value.slice(8))} ${months[Number(value.slice(5, 7)) - 1]}`;
  if (!first || !last)
    return (
      <Card style={s.empty}>
        <Icon name="trend" color={colors.secondary} size={24} />
        <Text style={s.heading}>{t('clientDetails.noProgress')}</Text>
        <Text style={[s.small, secondary, s.center]}>
          {t('clientDetails.noProgressHint')}
        </Text>
      </Card>
    );
  const max = Math.max(
    10,
    Math.ceil(Math.max(...rows.map((entry) => entry.top)) / 10) * 10,
  );
  const day = (value: string) => Date.parse(`${value}T00:00:00Z`);
  const span = day(last.date) - day(first.date);
  const points = rows.map((row) => ({
    x: span ? 34 + (264 * (day(row.date) - day(first.date))) / span : 166,
    y: 140 - (114 * row.top) / max,
  }));
  const delta = Number((last.top - first.top).toPrecision(12));
  const hair = scheme === 'dark' ? '#212227' : '#efefeb';
  return (
    <View style={s.progress}>
      <View style={s.picker} accessibilityLabel={t('clientDetails.comparison')}>
        {names.map((name) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityState={{ selected: exercise === name }}
            onPress={() => setSelected(name)}
            style={[
              s.chip,
              {
                borderColor: colors.border,
                backgroundColor:
                  exercise === name ? colors.ink : colors.surface,
              },
            ]}
          >
            <Text
              style={[
                s.chipText,
                {
                  color:
                    exercise === name
                      ? scheme === 'dark'
                        ? '#0b0c0e'
                        : '#fff'
                      : colors.secondary,
                },
              ]}
            >
              {name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Card>
        <Text style={s.heading}>{exercise}</Text>
        <Text style={[s.small, secondary]}>
          {t('clientDetails.latest', { date: date(last.date, true) })}
        </Text>
        <View style={s.valueRow}>
          <Text style={s.progressValue}>{number(last.top)}</Text>
          <Text style={[s.small, secondary]}>{last.unit}</Text>
        </View>
        <Text style={[s.small, secondary]}>
          {t('clientDetails.sets', { count: last.sets })}
        </Text>
        <Text
          style={[
            s.small,
            rows.length > 1 && s.change,
            { borderTopColor: hair },
          ]}
        >
          {rows.length > 1
            ? t('clientDetails.change', {
                delta: `${delta > 0 ? '+' : ''}${number(delta)}`,
                unit: last.unit,
                date: date(first.date),
              })
            : t('clientDetails.oneRecord')}
        </Text>
      </Card>
      {rows.length > 1 && (
        <Card>
          <Text style={s.heading}>
            {t(
              last.unit === 'кг'
                ? 'clientDetails.workingWeight'
                : 'clientDetails.valueColumn',
            )}
          </Text>
          <Text style={[s.small, secondary]}>
            {t('clientDetails.chartRange', {
              first: date(first.date),
              last: date(last.date),
              count: rows.length,
            })}
          </Text>
          <Svg
            viewBox="0 0 320 174"
            width="100%"
            height={174}
            accessible={Platform.OS === 'web' ? undefined : false}
            aria-hidden
          >
            {[0, max / 2, max].map((value) => (
              <Line
                key={`line-${value}`}
                x1={34}
                x2={298}
                y1={140 - (114 * value) / max}
                y2={140 - (114 * value) / max}
                stroke={hair}
              />
            ))}
            {[0, max / 2, max].map((value) => (
              <SvgText
                key={`label-${value}`}
                x={24}
                y={144 - (114 * value) / max}
                textAnchor="end"
                fill={colors.secondary}
                fontSize={14}
              >
                {number(value)}
              </SvgText>
            ))}
            <Polyline
              points={points.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke={colors.secondary}
              strokeWidth={1.5}
            />
            {points.map((point, index) => (
              <Circle
                key={index}
                cx={point.x}
                cy={point.y}
                r={index === points.length - 1 ? 5 : 4}
                stroke={
                  index === points.length - 1 ? colors.accent : colors.ink
                }
                fill={
                  index === points.length - 1 ? colors.accent : colors.surface
                }
                strokeWidth={2}
              />
            ))}
            <SvgText x={34} y={166} fill={colors.secondary} fontSize={14}>
              {date(first.date)}
            </SvgText>
            <SvgText
              x={298}
              y={166}
              textAnchor="end"
              fill={colors.secondary}
              fontSize={14}
            >
              {date(last.date)}
            </SvgText>
          </Svg>
          <Text style={[s.small, secondary]}>
            {t(
              last.unit === 'кг'
                ? 'clientDetails.chartHint'
                : 'clientDetails.valuesHint',
            )}
          </Text>
        </Card>
      )}
      <Card>
        <Text style={s.heading}>{t('clientDetails.records')}</Text>
        <View style={[s.tableRow, { borderBottomColor: hair }]}>
          <Text style={[s.small, s.flex, secondary]}>
            {t('clientDetails.date')}
          </Text>
          <Text style={[s.small, s.tableCell, secondary]}>
            {t(
              last.unit === 'кг'
                ? 'clientDetails.weightColumn'
                : 'clientDetails.valueColumn',
            )}
          </Text>
          <Text style={[s.small, s.tableCell, secondary]}>
            {t('clientDetails.setsColumn')}
          </Text>
        </View>
        {rows
          .slice()
          .reverse()
          .map((row, index) => (
            <View
              key={`${row.date}:${index}`}
              style={[s.tableRow, { borderBottomColor: hair }]}
            >
              <Text style={[s.small, s.flex]}>{date(row.date)}</Text>
              <Text style={[s.small, s.tableCell]}>{number(row.top)}</Text>
              <Text style={[s.small, s.tableCell]}>{row.sets}</Text>
            </View>
          ))}
      </Card>
    </View>
  );
}

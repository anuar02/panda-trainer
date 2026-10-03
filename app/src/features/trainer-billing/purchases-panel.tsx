import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  formatPurchaseExpiry,
  formatPurchaseMoney,
  projectClientPurchases,
} from '@/domain/purchases';
import { styles as s } from '@/features/client-details/styles';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icons';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { parity } from '@/ui/parity-tokens';
import type { TrainerBilling } from './types';
import type { trainerPurchasesRu } from './purchases-ru';
import { projectPurchasePayments } from '@/domain/payments';
import type { TrainerPayments } from '../trainer-payments/types';

export type PurchasesPanelProps = {
  billing: TrainerBilling | null;
  workspaceId: string;
  clientRecordId: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  payments?: TrainerPayments | null;
  paymentsLoading?: boolean;
  paymentsError?: boolean;
  disabled?: boolean;
  onReverse?: (paymentEntryId: string) => void;
  onPayment?: (purchaseId: string) => void;
};

export function PurchasesPanel({
  billing,
  workspaceId,
  clientRecordId,
  loading,
  error,
  onRetry,
  payments,
  paymentsLoading = false,
  paymentsError = false,
  disabled = false,
  onPayment,
  onReverse,
}: PurchasesPanelProps) {
  const { t, i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const text = (key: keyof typeof trainerPurchasesRu) =>
    t(`trainerPurchases.${key}`);
  const projection = billing
    ? projectClientPurchases(billing, { workspaceId, clientRecordId })
    : null;
  const paymentProjection =
    billing && payments && !paymentsError
      ? projectPurchasePayments(billing.purchases, payments, {
          workspaceId,
          clientRecordId,
        })
      : null;
  if (loading)
    return (
      <ActivityIndicator
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={text('loading')}
      />
    );
  if (error || !projection?.valid)
    return (
      <Card>
        <Text accessibilityRole="alert">{text('error')}</Text>
        <Button
          label={text('retry')}
          variant="soft"
          compact
          onPress={onRetry}
        />
      </Card>
    );
  const history =
    paymentProjection?.valid && !paymentsLoading
      ? paymentProjection.purchases
          .flatMap((row) => row.history)
          .sort(
            (a, b) =>
              b.paidOn.localeCompare(a.paidOn) ||
              b.createdAt.localeCompare(a.createdAt),
          )
      : null;
  const hasHistory = Boolean(history?.length);
  const secondary = { color: colors.secondary };
  return (
    <View style={s.stack}>
      {projection.purchases.length ? (
        projection.purchases.map(({ purchase, usedUnits }) => {
          const payment =
            paymentProjection?.valid && !paymentsLoading
              ? paymentProjection.purchases.find(
                  (row) => row.purchase.id === purchase.id,
                )
              : null;
          return (
            <Card key={purchase.id} flush>
              <View style={{ padding: 16 }}>
                <View style={s.purchaseHeader}>
                  <Text style={[s.rowTitle, s.flex]}>{purchase.title}</Text>
                  <StatusPill
                    label={
                      payment
                        ? payment.dueMinor === '0'
                          ? text('paid')
                          : t('trainerPurchases.debt', {
                              amount: formatPurchaseMoney(
                                payment.dueMinor,
                                i18n.language,
                              ),
                            })
                        : text('unknown')
                    }
                    tone={
                      payment
                        ? payment.dueMinor === '0'
                          ? 'success'
                          : 'warning'
                        : 'neutral'
                    }
                    dot={false}
                  />
                </View>
                <View style={{ marginTop: 10 }}>
                  {[
                    [
                      text('price'),
                      formatPurchaseMoney(purchase.priceMinor, i18n.language),
                    ],
                    [
                      text('received'),
                      payment
                        ? formatPurchaseMoney(payment.paidMinor, i18n.language)
                        : text('unknown'),
                    ],
                    [
                      text('units'),
                      t('trainerPurchases.usage', {
                        units: purchase.units,
                        used: usedUnits,
                      }),
                    ],
                    [
                      text('expiry'),
                      purchase.expiresOn
                        ? formatPurchaseExpiry(
                            purchase.expiresOn,
                            i18n.language,
                          )
                        : text('noExpiry'),
                    ],
                  ].map(([label, value], index) => (
                    <View
                      key={label}
                      style={[
                        s.kv,
                        { borderBottomColor: colors.border },
                        index === 3 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <Text style={secondary}>{label}</Text>
                      <Text style={s.kvValue}>{value}</Text>
                    </View>
                  ))}
                </View>
                <Button
                  label={text('payment')}
                  variant="soft"
                  compact
                  disabled={
                    disabled ||
                    !payment ||
                    payment.dueMinor === '0' ||
                    !onPayment
                  }
                  onPress={() => onPayment?.(purchase.id)}
                  style={{ marginTop: 12 }}
                />
              </View>
            </Card>
          );
        })
      ) : (
        <Card style={s.empty}>
          <Icon name="wallet" size={24} color={colors.secondary} />
          <Text style={s.heading}>{text('emptyTitle')}</Text>
          <Text style={[s.small, secondary, s.center]}>
            {text('emptyHint')}
          </Text>
        </Card>
      )}
      <Text style={[s.label, secondary, { marginTop: 8, marginHorizontal: 6 }]}>
        {text('paymentHistory')}
      </Text>
      <Card flush={hasHistory} style={hasHistory ? s.rows : undefined}>
        {history ? (
          history.length ? (
            history.map((entry, index) => (
              <View
                key={entry.id}
                style={[
                  s.sessionRow,
                  index > 0 && {
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    s.numberLead,
                    {
                      backgroundColor: parity[scheme].success.backgroundColor,
                    },
                  ]}
                >
                  <Icon
                    name="wallet"
                    size={18}
                    color={parity[scheme].success.color}
                  />
                </View>
                <View style={s.flex}>
                  <Text
                    style={[
                      s.rowTitle,
                      { fontFamily: 'Inter_600SemiBold', letterSpacing: 0.1 },
                      entry.reversedAt && {
                        textDecorationLine: 'line-through',
                      },
                    ]}
                  >
                    {formatPurchaseMoney(entry.amountMinor, i18n.language)}
                  </Text>
                  <Text style={[s.small, s.bookingMeta, secondary]}>
                    {t('trainerPurchases.paymentMeta', {
                      date: new Intl.DateTimeFormat(i18n.language, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      })
                        .format(new Date(`${entry.paidOn}T12:00:00Z`))
                        .replace(/\./g, ''),
                      method: entry.method,
                      note: entry.reason
                        ? t('trainerPurchases.paymentNote', {
                            note: entry.reason,
                          })
                        : '',
                    })}
                  </Text>
                  {entry.reversedAt ? (
                    <Text style={[s.small, secondary]}>
                      {t('trainerPurchases.reversedDate', {
                        date: formatPurchaseExpiry(
                          new Date(entry.reversedAt).toISOString().slice(0, 10),
                          i18n.language,
                        ),
                      })}
                    </Text>
                  ) : onReverse ? (
                    <Button
                      label={text('reverse')}
                      variant="ghost"
                      compact
                      disabled={disabled}
                      onPress={() => onReverse(entry.id)}
                    />
                  ) : null}
                </View>
                <StatusPill
                  label={text(entry.reversedAt ? 'reversed' : 'recorded')}
                  tone="neutral"
                  dot={false}
                />
              </View>
            ))
          ) : (
            <Text style={[s.small, secondary]}>{text('noPayments')}</Text>
          )
        ) : (
          <Text style={[s.small, secondary]}>{text('paymentUnavailable')}</Text>
        )}
        {paymentsError || (paymentProjection && !paymentProjection.valid) ? (
          <Button
            label={text('retry')}
            variant="soft"
            compact
            onPress={onRetry}
          />
        ) : null}
      </Card>
    </View>
  );
}

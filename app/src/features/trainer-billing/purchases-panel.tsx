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
import type { TrainerBilling } from './types';
import type { trainerPurchasesRu } from './purchases-ru';

export type PurchasesPanelProps = {
  billing: TrainerBilling | null;
  workspaceId: string;
  clientRecordId: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

export function PurchasesPanel({
  billing,
  workspaceId,
  clientRecordId,
  loading,
  error,
  onRetry,
}: PurchasesPanelProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const text = (key: keyof typeof trainerPurchasesRu) =>
    t(`trainerPurchases.${key}`);
  const projection = billing
    ? projectClientPurchases(billing, { workspaceId, clientRecordId })
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
  const secondary = { color: colors.secondary };
  return (
    <View style={s.stack}>
      {projection.purchases.length ? (
        projection.purchases.map(({ purchase, usedUnits }) => (
          <Card key={purchase.id} flush>
            <View style={{ padding: 16 }}>
              <View style={s.purchaseHeader}>
                <Text style={[s.rowTitle, s.flex]}>{purchase.title}</Text>
                <StatusPill
                  label={text('unknown')}
                  tone="neutral"
                  dot={false}
                />
              </View>
              <View style={{ marginTop: 10 }}>
                {[
                  [
                    text('price'),
                    formatPurchaseMoney(purchase.priceMinor, i18n.language),
                  ],
                  [text('received'), text('unknown')],
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
                      ? formatPurchaseExpiry(purchase.expiresOn, i18n.language)
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
                disabled
                accessibilityHint={t(
                  'workspaceClientDetails.billingUnavailable',
                )}
                style={{ marginTop: 12 }}
              />
            </View>
          </Card>
        ))
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
      <Card>
        <Text style={[s.small, secondary]}>{text('paymentUnavailable')}</Text>
      </Card>
    </View>
  );
}

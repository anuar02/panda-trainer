import { useLayoutEffect, useRef } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { styles as s } from '@/features/client-details/styles';
import { useWorkspaceMutations } from '../workspace-scheduling/mutation-provider';
import { useWorkspaceClock } from '../workspace-scheduling/use-clock';
import { workspaceDateKey } from '../workspace-scheduling/clock';
import { useTrainerPayments } from '../trainer-payments/use-payments';
import { useTrainerBilling } from './use-billing';
import {
  formatFinancialTotal,
  projectFinancialSummary,
} from './financial-summary';

export function ClientFinancialMetrics({
  userId,
  workspaceId,
  clientRecordId,
  timezone,
}: {
  userId: string;
  workspaceId: string;
  clientRecordId: string;
  timezone: string;
}) {
  const read = useTrainerBilling(userId, workspaceId, clientRecordId);
  const payments = useTrainerPayments(userId, workspaceId, clientRecordId);
  const mutations = useWorkspaceMutations();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const now = useWorkspaceClock();
  const generation = useRef(mutations.generation);
  const retry = read.retry;
  const retryPayments = payments.retry;
  useLayoutEffect(() => {
    if (generation.current === mutations.generation) return;
    generation.current = mutations.generation;
    retry();
    retryPayments();
  }, [mutations.generation, retry, retryPayments]);
  const summary =
    !read.loading &&
    !read.error &&
    read.data &&
    !payments.loading &&
    !payments.error &&
    payments.data
      ? projectFinancialSummary(
          read.data,
          payments.data,
          { workspaceId, clientRecordId },
          workspaceDateKey(now, timezone),
        )
      : null;
  const unknown = t('workspaceClientDetails.unknown');
  const secondary = { color: colors.secondary };
  return (
    <View style={s.metrics}>
      <Card flush style={s.metric}>
        <Text style={[s.label, s.metricLabel, secondary]}>
          {t('workspaceClientDetails.balance')}
        </Text>
        <Text style={s.balance}>
          {summary ? summary.remainingUnits : unknown}
        </Text>
      </Card>
      <Card flush style={s.metric}>
        <Text style={[s.label, s.metricLabel, secondary]}>
          {t('workspaceClientDetails.due')}
        </Text>
        <Text
          style={[
            s.due,
            summary && summary.dueMinor !== '0'
              ? { color: colors.warning }
              : undefined,
          ]}
        >
          {summary
            ? formatFinancialTotal(summary.dueMinor, i18n.language)
            : unknown}
        </Text>
      </Card>
    </View>
  );
}

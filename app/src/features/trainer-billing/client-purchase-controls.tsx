import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { useWorkspaceMutations } from '../workspace-scheduling/mutation-provider';
import { useTrainerBilling } from './use-billing';
import { PurchasesPanel } from './purchases-panel';
import { PurchaseCreateSheet } from './purchase-create-sheet';
import { useTrainerPayments } from '../trainer-payments/use-payments';
import { PaymentSheet } from '../trainer-payments/payment-sheet';
import { projectPurchasePayments } from '@/domain/payments';
import type { PurchasePaymentProjection } from '@/domain/payments';
import { workspaceDateKey } from '../workspace-scheduling/clock';
import { useWorkspaceClock } from '../workspace-scheduling/use-clock';
import { formatPurchaseMoney } from '@/domain/purchases';

export function ClientPurchaseControls({
  userId,
  workspaceId,
  clientRecordId,
  clientName,
  timezone,
}: {
  userId: string;
  workspaceId: string;
  clientRecordId: string;
  clientName: string;
  timezone: string;
}) {
  const { t } = useTranslation();
  const read = useTrainerBilling(userId, workspaceId, clientRecordId);
  const payments = useTrainerPayments(userId, workspaceId, clientRecordId);
  const now = useWorkspaceClock();
  const mutations = useWorkspaceMutations();
  const [open, setOpen] = useState(false);
  const [paymentSelection, setPaymentSelection] = useState<
    PurchasePaymentProjection['purchases'][number] | null
  >(null);
  const [submittedPurchaseId, setSubmittedPurchaseId] = useState<string | null>(
    null,
  );
  const generation = useRef(mutations.generation);
  const retry = read.retry;
  const retryPayments = payments.retry;
  useEffect(() => {
    if (generation.current === mutations.generation) return;
    generation.current = mutations.generation;
    retry();
    retryPayments();
  }, [mutations.generation, retry, retryPayments]);
  const { billing } = mutations;
  const pending =
    billing.pending &&
    billing.error !== 'storage' &&
    billing.error !== 'invalidPending';
  const crossBusy = mutations.busy && !billing.busy;
  const projection =
    read.data && payments.data && !payments.error
      ? projectPurchasePayments(read.data.purchases, payments.data, {
          workspaceId,
          clientRecordId,
        })
      : null;
  const selected = projection?.valid
    ? (projection.purchases.find(
        (row) => row.purchase.id === paymentSelection?.purchase.id,
      ) ?? null)
    : paymentSelection;
  return (
    <View className="gap-3">
      <Button
        label={t('trainerBillingPurchase.add')}
        variant="soft"
        compact
        disabled={mutations.blocked || read.loading || Boolean(read.error)}
        onPress={() => setOpen(true)}
      />
      {billing.pending || billing.error || billing.busy ? (
        <Card>
          <Text accessibilityRole="alert">
            {t(
              `trainerBilling.${billing.error === 'storage' ? 'storageError' : billing.error === 'invalidPending' ? 'invalidPending' : billing.error === 'conflict' ? 'conflict' : billing.error === 'invalidState' ? 'invalidState' : billing.error ? 'requestError' : billing.busy ? 'busy' : 'pending'}`,
            )}
          </Text>
          <Button
            label={t(pending ? 'trainerBilling.resume' : 'common.retry')}
            loading={billing.busy}
            disabled={crossBusy}
            onPress={() => {
              if (pending) void billing.resume();
              else {
                billing.reload();
                retry();
                retryPayments();
              }
            }}
          />
        </Card>
      ) : null}
      <PurchasesPanel
        billing={read.data}
        workspaceId={workspaceId}
        clientRecordId={clientRecordId}
        loading={read.loading}
        error={read.error !== null}
        onRetry={() => {
          retry();
          retryPayments();
        }}
        payments={payments.data}
        paymentsLoading={payments.loading}
        paymentsError={Boolean(payments.error)}
        disabled={mutations.blocked}
        onPayment={(id) => {
          const purchase = projection?.valid
            ? projection.purchases.find((row) => row.purchase.id === id)
            : null;
          if (purchase && !mutations.blocked) setPaymentSelection(purchase);
        }}
      />
      <PaymentSheet
        key={paymentSelection?.purchase.id ?? 'closed'}
        open={Boolean(selected)}
        clientName={clientName}
        purchaseTitle={selected?.purchase.title ?? ''}
        dueMinor={selected?.dueMinor ?? '0'}
        today={workspaceDateKey(now, timezone)}
        busy={billing.busy}
        disabled={
          mutations.blocked ||
          read.loading ||
          Boolean(read.error) ||
          payments.loading ||
          Boolean(payments.error) ||
          !projection?.valid
        }
        error={
          billing.error === 'overpayment' &&
          selected?.purchase.id === submittedPurchaseId
            ? t('trainerPayments.overDebt', {
                amount: formatPurchaseMoney(selected.dueMinor),
              })
            : null
        }
        onClose={() => setPaymentSelection(null)}
        onSubmit={(input) => {
          if (!selected) return Promise.resolve(false);
          setSubmittedPurchaseId(selected.purchase.id);
          return billing.submit({
            action: 'recordPayment',
            requestId: randomUUID(),
            purchaseId: selected.purchase.id,
            ...input,
          });
        }}
      />
      <PurchaseCreateSheet
        open={open}
        clientName={clientName}
        busy={billing.busy}
        disabled={mutations.blocked || read.loading || Boolean(read.error)}
        onClose={() => setOpen(false)}
        onSubmit={(input) =>
          billing.submit({
            action: 'createPurchase',
            requestId: randomUUID(),
            clientRecordId,
            ...input,
          })
        }
      />
    </View>
  );
}

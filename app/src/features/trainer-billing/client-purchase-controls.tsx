import { useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { useWorkspaceMutations } from '../workspace-scheduling/mutation-provider';
import { useMutationSession } from './use-mutation-session';
import { useTrainerBilling } from './use-billing';
import { PurchasesPanel } from './purchases-panel';
import { PurchaseCreateSheet } from './purchase-create-sheet';
import { useTrainerPayments } from '../trainer-payments/use-payments';
import { PaymentReversalSheet } from '../trainer-payments/reversal-sheet';
import { PaymentSheet } from '../trainer-payments/payment-sheet';
import { projectPurchasePayments } from '@/domain/payments';
import type { PurchasePaymentProjection } from '@/domain/payments';
import { workspaceDateKey } from '../workspace-scheduling/clock';
import { useWorkspaceClock } from '../workspace-scheduling/use-clock';
import { formatPurchaseMoney } from '@/domain/purchases';

type ClientPurchaseControlsProps = {
  userId: string;
  workspaceId: string;
  clientRecordId: string;
  clientName: string;
  timezone: string;
};
export function ClientPurchaseControls(props: ClientPurchaseControlsProps) {
  const session = useMutationSession();
  const version = session.version;
  return (
    <ClientPurchaseControlsContent
      key={JSON.stringify([
        props.userId,
        props.workspaceId,
        props.clientRecordId,
        version,
      ])}
      {...props}
      isSessionCurrent={() => session.isCurrent(version)}
    />
  );
}
function ClientPurchaseControlsContent({
  userId,
  workspaceId,
  clientRecordId,
  clientName,
  timezone,
  isSessionCurrent,
}: ClientPurchaseControlsProps & { isSessionCurrent: () => boolean }) {
  const { t } = useTranslation();
  const read = useTrainerBilling(userId, workspaceId, clientRecordId);
  const payments = useTrainerPayments(userId, workspaceId, clientRecordId);
  const now = useWorkspaceClock();
  const mutations = useWorkspaceMutations();
  const [reversalId, setReversalId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [paymentSelection, setPaymentSelection] = useState<
    PurchasePaymentProjection['purchases'][number] | null
  >(null);
  const [submittedPurchaseId, setSubmittedPurchaseId] = useState<string | null>(
    null,
  );
  const [formGeneration, setFormGeneration] = useState(mutations.generation);
  if (formGeneration !== mutations.generation) {
    setFormGeneration(mutations.generation);
    setReversalId(null);
    setOpen(false);
    if (mutations.billing.error !== 'overpayment') {
      setPaymentSelection(null);
      setSubmittedPurchaseId(null);
    }
  }
  const expectedGeneration = mutations.generation;
  const lifecycle = useRef({ active: true, generation: expectedGeneration });
  useLayoutEffect(() => {
    const token = { active: true, generation: expectedGeneration };
    lifecycle.current = token;
    return () => {
      token.active = false;
    };
  }, [expectedGeneration]);
  const isCurrent = () =>
    lifecycle.current.active &&
    lifecycle.current.generation === expectedGeneration &&
    isSessionCurrent();
  const generation = useRef(mutations.generation);
  const retry = read.retry;
  const retryPayments = payments.retry;
  useLayoutEffect(() => {
    if (generation.current === mutations.generation) return;
    generation.current = mutations.generation;
    retry();
    retryPayments();
  }, [mutations.generation, retry, retryPayments]);
  const { billing } = mutations;
  const pendingPurchaseId =
    billing.pending?.action === 'recordPayment'
      ? billing.pending.purchaseId
      : null;
  const foreignCommand =
    billing.pending?.action === 'reversePayment' ||
    billing.pending?.action === 'createPurchase'
      ? billing.pending.clientRecordId.toLowerCase() !==
        clientRecordId.toLowerCase()
      : billing.pending?.action === 'recordPayment'
        ? !read.data?.purchases.some(
            (purchase) =>
              purchase.id.toLowerCase() === pendingPurchaseId?.toLowerCase() &&
              purchase.clientRecordId.toLowerCase() ===
                clientRecordId.toLowerCase() &&
              purchase.workspaceId.toLowerCase() === workspaceId.toLowerCase(),
          )
        : false;
  const pending =
    billing.pending &&
    billing.error !== 'storage' &&
    billing.error !== 'invalidPending' &&
    !foreignCommand;
  const crossBusy = mutations.busy && !billing.busy;
  const projection =
    read.data && !read.error && payments.data && !payments.error
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
            disabled={crossBusy || foreignCommand}
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
        onReverse={(id) => {
          if (!mutations.blocked) setReversalId(id);
        }}
        onPayment={(id) => {
          const purchase = projection?.valid
            ? projection.purchases.find((row) => row.purchase.id === id)
            : null;
          if (purchase && !mutations.blocked && isCurrent()) {
            setSubmittedPurchaseId(null);
            setPaymentSelection(purchase);
          }
        }}
      />
      {reversalId &&
        projection?.valid &&
        projection.purchases
          .flatMap((row) => row.history)
          .filter((entry) => entry.id === reversalId && !entry.reversedAt)
          .map((entry) => (
            <PaymentReversalSheet
              key={JSON.stringify([entry.id, mutations.generation])}
              isCurrent={isCurrent}
              payment={entry}
              disabled={
                mutations.blocked ||
                payments.loading ||
                Boolean(payments.error) ||
                read.loading ||
                Boolean(read.error)
              }
              onClose={() => {
                if (isCurrent()) setReversalId(null);
              }}
              onConfirm={(reason) =>
                billing.submit({
                  action: 'reversePayment',
                  paymentEntryId: entry.id,
                  purchaseId: entry.purchaseId,
                  amountMinor: entry.amountMinor,
                  clientRecordId,
                  requestId: randomUUID(),
                  reason,
                })
              }
            />
          ))}
      <PaymentSheet
        key={JSON.stringify([
          paymentSelection?.purchase.id ?? 'closed',
          mutations.generation,
        ])}
        isCurrent={isCurrent}
        open={Boolean(selected)}
        clientName={clientName}
        purchaseId={selected?.purchase.id}
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
          projection?.valid &&
          !read.loading &&
          !payments.loading &&
          selected?.purchase.id === submittedPurchaseId
            ? t('trainerPayments.overDebt', {
                amount: formatPurchaseMoney(selected.dueMinor),
              })
            : null
        }
        onClose={() => {
          if (isCurrent()) {
            setPaymentSelection(null);
            setSubmittedPurchaseId(null);
          }
        }}
        onSubmit={(input) => {
          if (!selected || !isCurrent()) return Promise.resolve(false);
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
        key={mutations.generation}
        isCurrent={isCurrent}
        open={open}
        clientName={clientName}
        busy={billing.busy}
        disabled={mutations.blocked || read.loading || Boolean(read.error)}
        onClose={() => {
          if (isCurrent()) setOpen(false);
        }}
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

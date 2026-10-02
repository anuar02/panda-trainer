import { useTranslation } from 'react-i18next';
import { useWorkspaceClock } from '@/features/workspace-scheduling/use-clock';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';
import { ClientProgressScreen } from './client-progress-screen';
import { clientHistoryProgress } from './adapter';
import { useClientProgress } from './use-progress';

type Props = {
  userId: string;
  workspaceId: string;
  clientRecordId: string;
  trainerName: string;
};
export function ClientConnectedProgressScreen(props: Props) {
  return (
    <ClientConnectedProgressContent
      key={`${props.userId}:${props.workspaceId}:${props.clientRecordId}`}
      {...props}
    />
  );
}
function ClientConnectedProgressContent(props: Props) {
  const { t } = useTranslation();
  const now = useWorkspaceClock();
  const read = useClientProgress({
    userId: props.userId,
    clientRecordId: props.clientRecordId,
  });
  const context = read.data?.context;
  const progress = read.data ? clientHistoryProgress(read.data, now) : null;
  if (
    read.error ||
    (context &&
      (context.workspaceId !== props.workspaceId ||
        context.clientRecordId !== props.clientRecordId)) ||
    (progress && !progress.complete)
  )
    return (
      <Screen title={t('common.error')}>
        <Button label={t('common.retry')} onPress={read.retry} />
      </Screen>
    );
  return (
    <ClientProgressScreen
      data={{
        trainerName: context?.trainerName ?? props.trainerName,
        results: progress?.results ?? [],
        loading: read.loading,
      }}
    />
  );
}

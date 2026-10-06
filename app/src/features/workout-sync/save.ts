import type {
  JournalOperation,
  LocalEntry,
  OutboxStore,
  SyncState,
} from '@/domain/workout-sync/types';

export async function saveJournalEntry(
  store: OutboxStore,
  entry: LocalEntry,
  operation: JournalOperation,
  onState?: (state: SyncState) => void,
): Promise<void> {
  onState?.({ status: 'saving' });
  try {
    await store.save(entry, operation);
    onState?.({
      status: 'saved_on_phone',
      pending: (await store.pending(100)).length,
    });
  } catch (error) {
    onState?.({ status: 'error', message: 'local_save_failed' });
    throw error;
  }
}

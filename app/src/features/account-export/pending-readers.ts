import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { isExportUuid } from '@/domain/account-export';
import type { Scope } from '@/domain/account-local-export';
import { decodeWorkspaceDraft } from '@/features/workspace-library/draft';
import { loadPendingClientProgramAssignment } from '@/features/workspace-programs/pending';
import { loadPendingWorkspaceBooking } from '@/features/workspace-scheduling/pending';
import { loadPendingWorkspaceBookingStatus } from '@/features/workspace-scheduling/status-pending';
import { loadPendingWorkspaceProposal } from '@/features/workspace-scheduling/proposal-pending';
import { loadPendingTrainerBillingCommand } from '@/features/trainer-billing/command-storage';
import { loadPendingCorrectionCommand } from '@/features/workout-corrections/pending';
import { snapshotUtf8Bytes } from '@/features/workout-sync/snapshot-validation';
import type { CollectedSource, PendingReaders } from './collector-types';
import { boundedExportStep } from './service';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keys(value: unknown, required: string[], optional: string[] = []) {
  return (
    object(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => [...required, ...optional].includes(key))
  );
}

function exactTemplate(value: unknown, draft: boolean): boolean {
  if (
    !object(value) ||
    !keys(
      value,
      ['id', 'name', 'description', 'exercises'],
      draft ? [] : ['custom'],
    ) ||
    !Array.isArray(value.exercises)
  )
    return false;
  return value.exercises.every((line) =>
    keys(line, ['id', 'name', 'sets', 'reps', 'target', 'rest', 'unit']),
  );
}

function libraryRecord(raw: string): unknown {
  if (snapshotUtf8Bytes(raw) > 1024 * 1024) throw new Error('source_overflow');
  const value: unknown = JSON.parse(raw);
  if (
    !object(value) ||
    !keys(value, ['draft', 'baseRevision'], ['pendingSave']) ||
    (value.draft !== null && !exactTemplate(value.draft, true)) ||
    ('pendingSave' in value &&
      (!object(value.pendingSave) ||
        !keys(value.pendingSave, [
          'template',
          'requestId',
          'expectedRevision',
        ]) ||
        !exactTemplate(value.pendingSave.template, false)))
  )
    throw new Error('unknown_library_schema');
  decodeWorkspaceDraft(raw);
  return { raw, value };
}

export function createPendingExportReaders(
  scope: Scope,
  guard: () => Promise<void>,
  isCurrent: () => boolean,
): PendingReaders {
  const read = async (
    id: string,
    load: () => Promise<unknown[]>,
    gaps: string[] = [],
  ): Promise<CollectedSource> => {
    await guard();
    let records: unknown[];
    try {
      records = await boundedExportStep(load(), undefined, 5000);
    } catch {
      await guard();
      return {
        id,
        state: 'incomplete',
        records: [],
        gaps: ['inaccessible_or_malformed'],
      };
    }
    await guard();
    return {
      id,
      state: gaps.length ? 'incomplete' : 'complete',
      records,
      gaps,
    };
  };
  const singleton = async (load: () => Promise<unknown>) => {
    const value = await load();
    return value === null ? [] : [value];
  };
  return async () => {
    const { accountId, workspaceId } = scope;
    if (!isExportUuid(accountId) || !isExportUuid(workspaceId))
      throw new Error('invalid_export_scope');
    const sources: CollectedSource[] = [];
    sources.push(
      await read('schedulingPending', () =>
        singleton(() => loadPendingWorkspaceBooking(accountId, workspaceId)),
      ),
    );
    sources.push(
      await read('schedulingStatusPending', () =>
        singleton(() =>
          loadPendingWorkspaceBookingStatus(accountId, workspaceId),
        ),
      ),
    );
    sources.push(
      await read('schedulingProposalPending', () =>
        singleton(() => loadPendingWorkspaceProposal(accountId, workspaceId)),
      ),
    );
    sources.push(
      await read('billingPending', () =>
        singleton(() =>
          loadPendingTrainerBillingCommand(accountId, workspaceId),
        ),
      ),
    );
    sources.push(
      await read('programAssignmentPending', async () => {
        const prefix = `panda-trainer-pending-program-v1:${accountId}:${workspaceId}:`;
        const allKeys = await AsyncStorage.getAllKeys();
        await guard();
        if (allKeys.length > 10000) throw new Error('source_overflow');
        const matched = allKeys.filter((key) => key.startsWith(prefix)).sort();
        if (matched.length > 1000) throw new Error('source_overflow');
        const records: unknown[] = [];
        for (const key of matched) {
          const clientId = key.slice(prefix.length);
          if (!isExportUuid(clientId)) throw new Error('malformed_source_key');
          const pending = await loadPendingClientProgramAssignment(
            accountId,
            workspaceId,
            clientId,
            isCurrent,
          );
          await guard();
          if (pending === null) throw new Error('source_changed');
          records.push(pending);
        }
        return records;
      }),
    );
    sources.push(
      await read('correctionPending', async () => {
        const prefix = `panda-trainer-pending-correction-v1:${accountId.toLowerCase()}:${workspaceId.toLowerCase()}:`;
        const allKeys = await AsyncStorage.getAllKeys();
        await guard();
        if (allKeys.length > 10000) throw new Error('source_overflow');
        const matched = allKeys.filter((key) => key.startsWith(prefix)).sort();
        if (matched.length > 1000) throw new Error('source_overflow');
        const records: unknown[] = [];
        for (const key of matched) {
          const workoutId = key.slice(prefix.length);
          if (!isExportUuid(workoutId)) throw new Error('malformed_source_key');
          const command = await loadPendingCorrectionCommand(
            accountId,
            workspaceId,
            workoutId,
            isCurrent,
          );
          await guard();
          if (command === null) throw new Error('source_changed');
          records.push({ workoutId, command });
        }
        return records;
      }),
    );
    sources.push(
      await read('libraryDrafts', async () => {
        const key = `panda-trainer-workspace-template-v1:${accountId}:${workspaceId}`;
        const records: unknown[] = [];
        for (const [slot, storageKey] of [
          ['draft', key],
          ['pendingClear', `${key}:pending-clear`],
        ] as const) {
          const raw = await AsyncStorage.getItem(storageKey);
          await guard();
          if (raw !== null)
            records.push({ slot, ...objectRecord(libraryRecord(raw)) });
        }
        return records;
      }),
    );
    sources.push(
      await read('pending-content-fingerprint', async () => {
        const allKeys = await AsyncStorage.getAllKeys();
        await guard();
        if (allKeys.length > 10000) throw new Error('source_overflow');
        const suffix = `${accountId}:${workspaceId}`;
        const prefixes = [
          `panda-trainer-pending-program-v1:${suffix}:`,
          `panda-trainer-pending-correction-v1:${suffix}:`,
        ];
        const fixed = [
          `panda-trainer-pending-booking-v1:${suffix}`,
          `panda-trainer-pending-booking-status-v1:${suffix}`,
          `panda-trainer-pending-reschedule-v1:${suffix}`,
          `panda-trainer-pending-billing-v1:${suffix}`,
          `panda-trainer-workspace-template-v1:${suffix}`,
          `panda-trainer-workspace-template-v1:${suffix}:pending-clear`,
          `panda-trainer-workspace-exercise-v1:${suffix}`,
          `panda-trainer-workspace-exercise-v1:${suffix}:pending-clear`,
        ];
        const selected = [
          ...new Set([
            ...fixed,
            ...allKeys.filter((key) =>
              prefixes.some((prefix) => key.startsWith(prefix)),
            ),
          ]),
        ].sort();
        if (selected.length > 2008) throw new Error('source_overflow');
        const observed: [string, string | null][] = [];
        let bytes = 0;
        for (const key of selected) {
          const raw = await AsyncStorage.getItem(key);
          await guard();
          bytes +=
            snapshotUtf8Bytes(key) +
            (raw === null ? 0 : snapshotUtf8Bytes(raw));
          if (bytes > 4 * 1024 * 1024) throw new Error('source_overflow');
          observed.push([key, raw]);
        }
        const sha256 = await digestStringAsync(
          CryptoDigestAlgorithm.SHA256,
          JSON.stringify(observed),
        );
        await guard();
        return [{ sha256 }];
      }),
    );
    return sources;
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!object(value)) throw new Error('invalid_source_record');
  return value;
}

import type { ReactNode } from 'react';
import { View as MockView, Text as MockText } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { openWorkoutPreloadStore } from '../src/features/workout-preload/storage';
import {
  render,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { PreloadParticipant } from '../src/domain/workout-preload/types';
import type { SyncSession } from '../src/domain/workout-sync/types';
import type { EntryRead } from '../src/features/workout-entry/service';
import { WorkoutEntryService } from '../src/features/workout-entry/service';
import { WorkoutEntryPanel } from '../src/features/workout-entry/screen';
import '@/lib/i18n';
import { openEntryDraftStore } from '../src/features/workout-entry/storage';
import { loadEntryResources } from '../src/features/workout-entry/resources';
import {
  openOutboxStore,
  createOutboxRunner,
} from '../src/features/workout-sync';
import { createWorkoutPreloadReader } from '../src/features/workout-preload/service';
import { memoryStore, session } from './workout-sync-fixtures';

jest.mock('@/ui/sheet', () => ({
  Sheet: ({ children, title }: { children: ReactNode; title: string }) => (
    <MockView>
      <MockText>{title}</MockText>
      {children}
    </MockView>
  ),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../src/features/workout-preload/storage', () => ({
  openWorkoutPreloadStore: jest.fn(),
}));
jest.mock('../src/features/workout-entry/service', () => ({
  WorkoutEntryService: jest.fn(),
}));
jest.mock('../src/features/workout-entry/storage', () => ({
  openEntryDraftStore: jest.fn(),
}));
jest.mock('../src/features/workout-entry/resources', () => ({
  loadEntryResources: jest.fn(),
}));
jest.mock('../src/features/workout-sync', () => ({
  WorkoutSyncStatus: () => null,
  openOutboxStore: jest.fn(),
  createOutboxRunner: jest.fn(),
  createWorkoutSyncTransport: jest.fn(),
}));
jest.mock('../src/features/workout-preload/service', () => ({
  createWorkoutPreloadReader: jest.fn(),
}));
const participant: PreloadParticipant = {
  bookingId: 'booking',
  clientRecordId: 'client',
  clientName: 'Client',
  programId: 'program',
  programName: 'Program',
  programDescription: '',
  baseTemplateId: 'template',
  programRevision: 1,
  workoutId: 'workout',
  workoutRevision: 1,
  workoutStatus: 'in_progress',
  exercises: [],
  assignedExercises: [],
};
const data = (p = participant): EntryRead => ({
  workout: { participant: p, tombstones: [] },
  draft: {
    workoutId: p.workoutId,
    bookingId: p.bookingId,
    focusExerciseId: null,
    values: {},
  },
  issues: [],
});
const resources = { catalog: [], conflicts: [] };
let current: SyncSession | null;
let outbox: ReturnType<typeof memoryStore>;
const drafts = {
  scope: session,
  getDeviceId: jest.fn(),
  read: jest.fn(),
  save: jest.fn(),
  close: jest.fn(),
  readResources: jest.fn(),
  saveResources: jest.fn(),
};
const read = jest.fn(async (p: PreloadParticipant) => data(p));
const run = jest.fn(async () => {});
const stop = jest.fn();
const load = jest.fn();
const finish = jest.fn(async (p: PreloadParticipant) => data(p));
beforeEach(() => {
  jest.clearAllMocks();
  finish.mockImplementation(async (p) => data(p));
  let uuid = 0;
  jest
    .mocked(randomUUID)
    .mockImplementation(
      () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
    );
  jest.mocked(openWorkoutPreloadStore).mockResolvedValue({
    scope: session,
    read: jest.fn(async () => null),
    save: jest.fn(async () => {}),
    close: jest.fn(async () => {}),
  } as unknown as Awaited<ReturnType<typeof openWorkoutPreloadStore>>);
  current = session;
  outbox = memoryStore();
  outbox.close = jest.fn(async () => {});
  drafts.getDeviceId.mockResolvedValue('device');
  drafts.close.mockResolvedValue(undefined);
  drafts.readResources.mockResolvedValue(null);
  drafts.saveResources.mockResolvedValue(undefined);
  read.mockImplementation(async (p) => data(p));
  jest
    .mocked(openOutboxStore)
    .mockResolvedValue(outbox as Awaited<ReturnType<typeof openOutboxStore>>);
  jest
    .mocked(openEntryDraftStore)
    .mockResolvedValue(
      drafts as unknown as Awaited<ReturnType<typeof openEntryDraftStore>>,
    );
  jest.mocked(WorkoutEntryService).mockImplementation(
    () =>
      ({
        read,
        finish,
        flush: async () => {},
        pendingCount: async () => 1,
      }) as unknown as WorkoutEntryService,
  );
  jest.mocked(createOutboxRunner).mockReturnValue({ run, stop });
  jest.mocked(loadEntryResources).mockResolvedValue(resources);
  load.mockRejectedValue(new Error('offline'));
  jest.mocked(createWorkoutPreloadReader).mockReturnValue({ load });
});

it('completes the finish conflict current resolution refresh reopen edit and explicit finish through the real screen', async () => {
  const ActualService = jest.requireActual<
    typeof import('../src/features/workout-entry/service')
  >('../src/features/workout-entry/service').WorkoutEntryService;
  const { openOutboxStore: openActualOutbox } = jest.requireActual<
    typeof import('../src/features/workout-sync/storage')
  >('../src/features/workout-sync/storage');
  const { TransactionalFixture } = jest.requireActual<
    typeof import('./workout-sync-sqlite-fixture')
  >('./workout-sync-sqlite-fixture');
  const { finishParticipant, finishSnapshotDriver } = jest.requireActual<
    typeof import('./workout-finish-fixtures')
  >('./workout-finish-fixtures');
  const sqlite = new TransactionalFixture();
  let store = await openActualOutbox(session, finishSnapshotDriver(sqlite));
  const saved = new Map<
    string,
    import('../src/domain/workout-entry').EntryDraft
  >();
  drafts.read.mockImplementation(async (id: string) => saved.get(id) ?? null);
  drafts.save.mockImplementation(
    async (value: import('../src/domain/workout-entry').EntryDraft) => {
      saved.set(value.workoutId, structuredClone(value));
    },
  );
  jest.mocked(openOutboxStore).mockResolvedValue(store);
  jest
    .mocked(WorkoutEntryService)
    .mockImplementation((options) => new ActualService(options));
  const person = finishParticipant();
  const context = (value: PreloadParticipant) => ({
    version: 1 as const,
    scope: session,
    sessionKey: value.bookingId,
    startsAt: '2026-10-04T10:00:00Z',
    loadedAt: '2026-10-04T11:00:00Z',
    participants: [value],
  });
  let fresh = person;
  let stage = 0;
  let originalId = '';
  run.mockImplementation(async () => {
    const pending = await store.pending();
    const operation = pending[0]!.operation;
    if (stage === 0) {
      originalId = operation.operation_id;
      await store.acknowledge([
        {
          operation_id: operation.operation_id,
          entity_id: operation.entity_id,
          status: 'conflict',
          revision: 9,
          conflict_id: 'finish-choice',
        },
      ]);
      fresh = { ...person, workoutRevision: 9 };
      jest.mocked(loadEntryResources).mockResolvedValue({
        catalog: [],
        conflicts: [
          {
            id: 'finish-choice',
            entityId: person.workoutId,
            revision: 9,
            current: {},
            incoming: {},
          },
        ],
      });
    } else if (stage === 1) {
      expect(operation.kind).toBe('resolve_conflict');
      expect(operation.payload.selected_version).toBe('current');
      await store.acknowledge([
        {
          operation_id: operation.operation_id,
          entity_id: operation.entity_id,
          status: 'applied',
          revision: 10,
        },
      ]);
      fresh = { ...person, workoutRevision: 10 };
      jest.mocked(loadEntryResources).mockResolvedValue(resources);
    } else if (stage === 2) {
      expect(operation.kind).toBe('upsert_set');
      const service = jest.mocked(WorkoutEntryService).mock.results.at(-1)!
        .value as WorkoutEntryService;
      fresh = (await service.read(fresh)).workout.participant;
      await store.acknowledge([
        {
          operation_id: operation.operation_id,
          entity_id: operation.entity_id,
          status: 'applied',
          revision: 1,
        },
      ]);
    } else {
      expect(operation.kind).toBe('finish_workout');
      expect(operation.operation_id).not.toBe(originalId);
      expect(operation.base_revision).toBe(10);
    }
    stage += 1;
    load.mockResolvedValue(context(fresh));
  });
  const panel = () => (
    <WorkoutEntryPanel
      session={current}
      getSession={() => current}
      participant={person}
    />
  );
  let view = await render(panel());
  await waitFor(() => expect(screen.getByLabelText('Повторы')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Завершить' }));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить записанное и завершить' }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Выбрать текущую версию' }),
    ).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Выбрать текущую версию' }),
  );
  await waitFor(() =>
    expect(
      screen.getByText('Сохранена текущая версия · журнал не завершён'),
    ).toBeTruthy(),
  );
  await view.unmount();
  store = await openActualOutbox(session, finishSnapshotDriver(sqlite));
  jest.mocked(openOutboxStore).mockResolvedValue(store);
  jest.mocked(openWorkoutPreloadStore).mockResolvedValue({
    scope: session,
    read: async () => context(fresh),
    save: async () => {},
    close: async () => {},
  } as unknown as Awaited<ReturnType<typeof openWorkoutPreloadStore>>);
  view = await render(panel());
  await waitFor(() => expect(screen.getByLabelText('Повторы')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('Повторы'), '8');
  await fireEvent.changeText(screen.getByLabelText('Вес, кг'), '20');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Записать подход 1' }),
  );
  await waitFor(() => expect(stage).toBe(3));
  await waitFor(() => expect(screen.getByText('20 кг · 8 повт.')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Завершить' }));
  expect(screen.getByText('Завершить журнал?')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить записанное и завершить' }),
  );
  await waitFor(() => expect(stage).toBe(4));
  expect(
    screen.getByText('Завершение сохранено на телефоне · ожидает отправки'),
  ).toBeTruthy();
  expect(screen.queryByLabelText('Повторы')).toBeNull();
  expect(screen.getByText('20 кг · 8 повт.')).toBeTruthy();
});

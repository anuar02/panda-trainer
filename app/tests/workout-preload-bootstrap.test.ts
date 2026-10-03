import { findWorkoutPreloadRecovery } from '../src/features/workout-preload/bootstrap';
import type {
  SQLiteDriver,
  SQLiteParameter,
} from '../src/features/workout-sync/storage';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture() {
  const rows: { account: string; workspace_id: string; value_json: string }[] =
    [];
  const contexts = new Map<string, string>();
  const close = jest.fn(async () => undefined);
  const driver: SQLiteDriver = {
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async () => {
      throw new Error('Unexpected write');
    }),
    getAllAsync: async <T>(_sql: string, ...parameters: SQLiteParameter[]) =>
      rows
        .filter((row) => row.account === parameters[0])
        .map(
          ({ workspace_id, value_json }) => ({ workspace_id, value_json }) as T,
        ),
    getFirstAsync: async <T>(
      _sql: string,
      ...parameters: SQLiteParameter[]
    ) => {
      const value = contexts.get(JSON.stringify(parameters));
      return value ? ({ value_json: value } as T) : null;
    },
    withExclusiveTransactionAsync: async () => {
      throw new Error('Unexpected transaction');
    },
    closeAsync: close,
  };
  function add(
    account: string,
    workspace: string,
    loadedAt = '2026-10-03T10:00:00Z',
  ) {
    const recovery = {
      version: 1,
      sessionKey: 'session',
      bookingId: id(10),
      clientRecordId: id(11),
      collapsed: true,
    };
    const exercise = {
      id: id(12),
      exerciseId: id(13),
      name: 'Synthetic',
      measure: 'reps',
      position: 0,
      plannedSets: 0,
      plannedReps: null,
      plannedSeconds: null,
      plannedWeightGrams: null,
      restSeconds: 0,
      revision: 0,
      sets: [],
      previousSets: [],
      bodyweight: false,
      muscleGroup: '',
      equipment: '',
      instructions: [],
      sourceKey: null,
      skipped: false,
      replacedFromId: null,
    };
    const context = {
      version: 1,
      scope: { accountId: account, workspaceId: workspace },
      sessionKey: 'session',
      startsAt: '2026-10-03T12:00:00Z',
      loadedAt,
      participants: [
        {
          bookingId: id(10),
          clientRecordId: id(11),
          clientName: 'Synthetic',
          programId: id(14),
          programName: 'Synthetic',
          programRevision: 0,
          programDescription: '',
          baseTemplateId: id(15),
          workoutId: id(16),
          workoutRevision: 0,
          workoutStatus: 'in_progress',
          exercises: [],
          assignedExercises: [exercise],
        },
      ],
    };
    rows.push({
      account,
      workspace_id: workspace,
      value_json: JSON.stringify(recovery),
    });
    contexts.set(
      JSON.stringify([account, workspace, 'session']),
      JSON.stringify(context),
    );
    return { context, recovery };
  }
  return { driver, close, rows, contexts, add };
}
describe('offline recovery bootstrap with SQLite mock', () => {
  test('first boot and own account selection close without writes', async () => {
    const empty = fixture();
    expect(await findWorkoutPreloadRecovery(id(1), empty.driver)).toBeNull();
    expect(empty.close).toHaveBeenCalledTimes(1);
    const mock = fixture();
    mock.add(id(2), id(3));
    expect(await findWorkoutPreloadRecovery(id(1), mock.driver)).toBeNull();
    expect(mock.driver.runAsync).not.toHaveBeenCalled();
  });
  test('latest own workspace and deterministic ties', async () => {
    const mock = fixture();
    mock.add(id(1), id(4), '2026-10-03T09:00:00Z');
    mock.add(id(1), id(3));
    mock.add(id(1), id(2));
    const result = await findWorkoutPreloadRecovery(id(1), mock.driver);
    expect(result?.scope.workspaceId).toBe(id(2));
    expect(mock.close).toHaveBeenCalledTimes(1);
  });
  test('scope corruption, unknown context and unknown participant throw and close', async () => {
    for (const mutation of ['scope', 'missing', 'participant', 'workspace']) {
      const mock = fixture();
      const { context } = mock.add(id(1), id(2));
      const key = JSON.stringify([id(1), id(2), 'session']);
      if (mutation === 'scope') context.scope.accountId = id(3);
      if (mutation === 'participant')
        context.participants[0]!.clientRecordId = id(99);
      mock.contexts.set(key, JSON.stringify(context));
      if (mutation === 'missing') mock.contexts.delete(key);
      if (mutation === 'workspace') mock.rows[0]!.workspace_id = 'invalid';
      await expect(
        findWorkoutPreloadRecovery(id(1), mock.driver),
      ).rejects.toThrow();
      expect(mock.close).toHaveBeenCalledTimes(1);
    }
  });
  test('close failure is surfaced', async () => {
    const mock = fixture();
    mock.close.mockRejectedValueOnce(new Error('close failure'));
    await expect(
      findWorkoutPreloadRecovery(id(1), mock.driver),
    ).rejects.toThrow('close failure');
  });
});

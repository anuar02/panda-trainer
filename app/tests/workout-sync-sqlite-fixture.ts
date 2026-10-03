import type {
  SQLiteDriver,
  SQLiteExecutor,
  SQLiteParameter,
} from '../src/features/workout-sync/storage';
type Row = {
  account: SQLiteParameter;
  workspace: SQLiteParameter;
  id: SQLiteParameter;
  operation_json: string;
  sequence: number;
  result_json: string | null;
  confirmed: number;
};
export class TransactionalFixture {
  entries = new Map<string, string>();
  rows: Row[] = [];
  failInsert = false;
  connect(): SQLiteDriver {
    let closed = false;
    const key = (parameters: SQLiteParameter[]) =>
      JSON.stringify(parameters.slice(0, 3));
    const executor: SQLiteExecutor = {
      execAsync: async () => {
        if (closed) throw new Error('closed');
      },
      runAsync: async (sql, ...p) => {
        if (closed) throw new Error('closed');
        if (sql.startsWith('INSERT INTO workout_local_entries'))
          this.entries.set(key(p), String(p[3]));
        else if (sql.startsWith('INSERT INTO workout_outbox')) {
          if (this.failInsert) throw new Error('insert failure');
          this.rows.push({
            account: p[0] ?? null,
            workspace: p[1] ?? null,
            id: p[2] ?? null,
            operation_json: String(p[4]),
            sequence: this.rows.length + 1,
            result_json: null,
            confirmed: 0,
          });
        } else if (sql.startsWith('UPDATE')) {
          const row = this.rows.find(
            (item) =>
              item.account === p[2] &&
              item.workspace === p[3] &&
              item.id === p[4],
          );
          if (row) {
            row.result_json = String(p[0]);
            row.confirmed = Number(p[1]);
          }
        } else throw new Error(sql);
      },
      getFirstAsync: async <T>(
        sql: string,
        ...p: SQLiteParameter[]
      ): Promise<T | null> => {
        if (closed) throw new Error('closed');
        if (sql.includes('FROM workout_local_entries')) {
          const value = this.entries.get(key(p));
          return value === undefined ? null : ({ value_json: value } as T);
        }
        return (
          (this.rows.find(
            (row) =>
              row.account === p[0] && row.workspace === p[1] && row.id === p[2],
          ) as T) ?? null
        );
      },
      getAllAsync: async <T>(
        sql: string,
        ...p: SQLiteParameter[]
      ): Promise<T[]> => {
        if (closed) throw new Error('closed');
        return this.rows
          .filter(
            (row) =>
              row.account === p[0] &&
              row.workspace === p[1] &&
              row.confirmed === (sql.includes('confirmed = 1') ? 1 : 0),
          )
          .slice(0, p[2] === undefined ? undefined : Number(p[2])) as T[];
      },
    };
    return {
      ...executor,
      closeAsync: async () => {
        closed = true;
      },
      withExclusiveTransactionAsync: async (task) => {
        const entries = new Map(this.entries);
        const rows = this.rows.map((row) => ({ ...row }));
        try {
          await task(executor);
        } catch (error) {
          this.entries = entries;
          this.rows = rows;
          throw error;
        }
      },
    };
  }
}

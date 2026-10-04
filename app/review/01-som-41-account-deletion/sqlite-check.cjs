const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(path.dirname(require.resolve('./sqlite-check.cjs')), '../../src/features/account-deletion/local.ts'), 'utf8');
const moduleObject = { exports: {} };
const stub = (id) => {
  if (id === './storage-fence') return {};
  if (id.includes('async-storage')) return { __esModule: true, default: {} };
  if (id === 'expo-crypto') return { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_, text) => crypto.createHash('sha256').update(text).digest('hex') };
  if (id.includes('snapshot-validation')) return { validateSnapshotOperation: () => { throw new Error('outbox fixture intentionally absent'); } };
  if (id.includes('file-contract')) return { exportUtf8Bytes: (text) => Buffer.byteLength(text) };
  throw new Error(`Unexpected runtime import ${id}`);
};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: moduleObject.exports, module: moduleObject, require: stub, Object, JSON, Set, Error });
const databases = new Map();
const schemas = [...source.matchAll(/  (workout_\w+):\s*'([^']+)'/g)];
const adapter = {
  storage: { getAllKeys: async () => [], getItem: async () => null, removeItem: async () => {} },
  hash: async (text) => crypto.createHash('sha256').update(text).digest('hex'),
  open: async (name) => {
    if (!databases.has(name)) {
      const database = new DatabaseSync(':memory:');
      for (const table of moduleObject.exports.deletionTables[name]) {
        const schema = schemas.find((match) => match[1] === table);
        assert(schema, `Missing schema ${table}`);
        database.exec(`CREATE TABLE ${table}(${schema[2]})`);
      }
      databases.set(name, database);
    }
    const database = databases.get(name);
    const driver = {
      execAsync: async (sql) => database.exec(sql),
      runAsync: async (sql, ...parameters) => database.prepare(sql).run(...parameters),
      getAllAsync: async (sql, ...parameters) => database.prepare(sql).all(...parameters),
      getFirstAsync: async (sql, ...parameters) => database.prepare(sql).get(...parameters) ?? null,
      closeAsync: async () => {},
      withExclusiveTransactionAsync: async (task) => {
        database.exec('BEGIN EXCLUSIVE');
        try { await task(driver); database.exec('COMMIT'); } catch (error) { database.exec('ROLLBACK'); throw error; }
      },
    };
    return driver;
  },
};
async function run() {
  const account = '31000000-0000-4000-8000-000000000001';
  const foreign = '31000000-0000-4000-8000-000000000002';
  const guard = async () => {};
  const driver = await adapter.open('workout-entry.db');
  await driver.runAsync('INSERT INTO workout_entry_resources VALUES(?,?,?,?)', account, account, account, '{"cache":"own"}');
  await driver.runAsync('INSERT INTO workout_entry_resources VALUES(?,?,?,?)', foreign, foreign, foreign, '{"cache":"foreign"}');
  const snapshot = await moduleObject.exports.readDeletionLocal(account, guard, adapter);
  assert.equal(snapshot.outstanding, 0);
  await moduleObject.exports.fenceDeletionLocal(snapshot, guard, adapter);
  for (const sql of [
    `INSERT INTO workout_entry_resources VALUES('${account}','w','new','{}')`,
    `UPDATE workout_entry_resources SET value_json='{}' WHERE account_id='${account}'`,
    `UPDATE workout_entry_resources SET account_id='${account}' WHERE account_id='${foreign}'`,
    `UPDATE workout_entry_resources SET account_id='${foreign}' WHERE account_id='${account}'`,
    `DELETE FROM workout_entry_resources WHERE account_id='${account}'`,
  ]) await assert.rejects(driver.execAsync(sql), /account_deletion_pending/);
  await driver.runAsync('INSERT INTO workout_entry_resources VALUES(?,?,?,?)', foreign, foreign, 'new', '{}');
  await moduleObject.exports.cleanupDeletedAccountCache(snapshot, guard, adapter);
  assert.equal((await driver.getAllAsync('SELECT * FROM workout_entry_resources WHERE account_id=?', account)).length, 0);
  assert.equal((await driver.getAllAsync('SELECT * FROM workout_entry_resources WHERE account_id=?', foreign)).length, 2);
  assert.equal(await moduleObject.exports.canResumeDeletionCleanup(account, snapshot.fingerprint, guard, adapter), true);
  assert.equal(await moduleObject.exports.canResumeDeletionCleanup(account, '0'.repeat(64), guard, adapter), false);
  await assert.rejects(driver.runAsync('INSERT INTO workout_entry_resources VALUES(?,?,?,?)', account, account, 'late', '{}'), /account_deletion_pending/);
  const changed = await moduleObject.exports.readDeletionLocal(account, guard, adapter);
  assert.notEqual(changed.fingerprint, snapshot.fingerprint);
  for (const database of databases.values()) database.close();
  process.stdout.write('PASS: production local inventory/fence/cleanup SQL on Node SQLite; own late writes denied, foreign cache preserved, original cleanup proof retained\n');
}
run().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

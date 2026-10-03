import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('./validate.mjs', import.meta.url));
const template = JSON.parse(readFileSync(new URL('./template.json', import.meta.url), 'utf8'));
const fixture = () => ({
  ...structuredClone(template),
  devProjectRef: 'a'.repeat(20),
  devProjectUrl: `https://${'a'.repeat(20)}.supabase.co`,
  pilotProjectRef: 'b'.repeat(20),
  pilotProjectUrl: `https://${'b'.repeat(20)}.supabase.co`,
});
const secret = 'SYNTHETIC_CREDENTIAL_DO_NOT_ECHO_987';
const run = (config, { raw = false, args } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'pilot-config-test-'));
  try {
    const path = join(dir, 'public.json');
    writeFileSync(path, raw ? config : JSON.stringify(config));
    const result = spawnSync(process.execPath, [cli, ...(args ?? [path])], {
      encoding: 'utf8',
      env: { SUPABASE_SERVICE_ROLE_KEY: secret, SUPABASE_ACCESS_TOKEN: secret },
    });
    assert.equal(result.error, undefined);
    const output = result.stdout + result.stderr;
    assert.ok(!output.includes(secret));
    assert.ok(!output.includes(dir));
    return { status: result.status, output };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const invalid = config => {
  const result = run(config);
  assert.equal(result.status, 1);
  assert.match(result.output, /LOCAL CONFIG INVALID/);
  assert.doesNotMatch(result.output, /LOCAL CONFIG VALID|PASS/);
};

test('valid synthetic manifest is local only, trailing Supabase slash allowed', () => {
  const config = fixture();
  config.pilotProjectUrl += '/';
  const result = run(config);
  assert.equal(result.status, 0);
  assert.match(result.output, /LOCAL CONFIG VALID ONLY/);
  assert.match(result.output, /NOT VERIFIED/);
});
test('template intentionally fails until actual public identities are supplied', () => invalid(template));
test('dev equals pilot cannot pass', () => {
  const config = fixture();
  config.pilotProjectRef = config.devProjectRef;
  config.pilotProjectUrl = config.devProjectUrl;
  invalid(config);
});
test('every required field is required', () => {
  for (const key of Object.keys(template)) {
    const config = fixture();
    delete config[key];
    invalid(config);
  }
});
test('malformed refs fail', () => {
  for (const value of ['', null, 20, 'A'.repeat(20), 'a'.repeat(19), 'a'.repeat(21), '../project', secret])
    for (const name of ['dev', 'pilot']) invalid({ ...fixture(), [`${name}ProjectRef`]: value });
});
test('URLs require exact matching secure cloud origins', () => {
  for (const value of [null, '', 'garbage', 'http://bbbbbbbbbbbbbbbbbbbb.supabase.co',
    'https://aaaaaaaaaaaaaaaaaaaa.supabase.co', 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co.evil.test',
    `https://user:${secret}@bbbbbbbbbbbbbbbbbbbb.supabase.co`,
    'https://bbbbbbbbbbbbbbbbbbbb.supabase.co:444',
    'https://bbbbbbbbbbbbbbbbbbbb.supabase.co/path',
    `https://bbbbbbbbbbbbbbbbbbbb.supabase.co?key=${secret}`,
    `https://bbbbbbbbbbbbbbbbbbbb.supabase.co#${secret}`, 'https://127.0.0.1'])
    invalid({ ...fixture(), pilotProjectUrl: value });
});
test('invite domain and origins must be canonical', () => {
  for (const field of ['inviteDomain', 'inviteBaseUrl', 'authSiteUrl'])
    for (const value of ['', secret, 'https://narutouzumaki.kz', 'http://trainer.narutouzumaki.kz',
      'https://trainer.narutouzumaki.kz/', 'https://invite.trainer.narutouzumaki.kz',
      'https://trainer.narutouzumaki.kz/invite', 'https://trainer.narutouzumaki.kz?x=1'])
      invalid({ ...fixture(), [field]: value });
});
test('redirects reject wrong, duplicated, missing, dev, wildcard and credential values', () => {
  const exact = fixture().allowedRedirects;
  for (const value of [null, exact[0], [], [exact[0]], [exact[0], exact[0]], [...exact, secret],
    [exact[1], 'https://trainer.narutouzumaki.kz/**'],
    [exact[1], 'http://localhost:8081/auth/callback'],
    [exact[1], `${exact[0]}?token=${secret}`],
    [exact[0], 'panda-trainer://other/callback']]) invalid({ ...fixture(), allowedRedirects: value });
  assert.equal(run({ ...fixture(), allowedRedirects: exact.reverse() }).status, 0);
});
test('free choices, region intent, retention and no import are enforced', () => {
  for (const field of ['supabasePlan', 'smtpPlan', 'inviteHosting', 'monitoringPlan', 'buildPlan',
    'pushService', 'backupMode', 'databaseRegion', 'schemaVersion', 'backupRetentionDays',
    'paidOptionsEnabled', 'prototypeImport']) invalid({ ...fixture(), [field]: 'wrong' });
});
test('paid options, prototype import and extended retention fail', () => {
  invalid({ ...fixture(), paidOptionsEnabled: true });
  invalid({ ...fixture(), prototypeImport: true });
  invalid({ ...fixture(), backupRetentionDays: 8 });
});
test('unknown credentials or malicious field names never appear in diagnostics', () => {
  invalid({ ...fixture(), serviceRoleKey: secret });
  invalid({ ...fixture(), [secret]: secret });
  invalid({ ...fixture(), pilotProjectUrl: { password: secret } });
});
test('malformed JSON, wrong top-level types and CLI errors are safe failures', () => {
  for (const value of [`{"password":"${secret}"`, secret]) {
    const result = run(value, { raw: true });
    assert.equal(result.status, 1);
    assert.match(result.output, /parser errors are withheld/);
  }
  for (const value of [null, [], 'string', 4]) invalid(value);
  for (const args of [[], [secret], [secret + '.json'], ['.env'], ['--help', secret]])
    assert.equal(run(fixture(), { args }).status, 1);
});

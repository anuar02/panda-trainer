import { readFileSync } from 'node:fs';

const origin = 'https://trainer.narutouzumaki.kz';
const redirects = [`${origin}/auth/callback`, 'panda-trainer://auth/callback'];
const choices = {
  schemaVersion: 1,
  databaseRegion: 'eu-central-1',
  inviteDomain: 'trainer.narutouzumaki.kz',
  inviteBaseUrl: origin,
  authSiteUrl: origin,
  supabasePlan: 'free',
  inviteHosting: 'cloudflare-pages-free',
  smtpPlan: 'free',
  monitoringPlan: 'sentry-developer-free',
  buildPlan: 'eas-free',
  pushService: 'expo-push-free',
  backupMode: 'self-managed-nightly-pg-dump',
  backupRetentionDays: 7,
  paidOptionsEnabled: false,
  prototypeImport: false,
};
const projectFields = ['devProjectRef', 'devProjectUrl', 'pilotProjectRef', 'pilotProjectUrl'];
const keys = new Set([...Object.keys(choices), ...projectFields, 'allowedRedirects']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isRef = value => typeof value === 'string' && /^[a-z0-9]{20}$/.test(value);
const matchesProjectUrl = (value, ref) => {
  if (typeof value !== 'string' || !isRef(ref)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === `${ref}.supabase.co` &&
      !url.username && !url.password && !url.port && !url.search && !url.hash &&
      url.pathname === '/' &&
      (value === `https://${ref}.supabase.co` || value === `https://${ref}.supabase.co/`);
  } catch {
    return false;
  }
};

const validate = config => {
  if (!isObject(config)) return ['Config must be a public JSON object.'];
  if (Object.keys(config).some(key => !keys.has(key)))
    return ['Unknown fields rejected. Use only the public template; remove credentials and extra fields.'];
  const errors = [];
  for (const [field, expected] of Object.entries(choices)) {
    if (config[field] !== expected) errors.push(`${field}: missing or differs from the approved pilot choice.`);
  }
  for (const name of ['dev', 'pilot']) {
    if (!isRef(config[`${name}ProjectRef`]))
      errors.push(`${name}ProjectRef: require a 20-character lowercase alphanumeric cloud project ref.`);
    if (!matchesProjectUrl(config[`${name}ProjectUrl`], config[`${name}ProjectRef`]))
      errors.push(`${name}ProjectUrl: require the matching HTTPS Supabase origin without credentials, path or query.`);
  }
  if (isRef(config.devProjectRef) && config.devProjectRef === config.pilotProjectRef)
    errors.push('Isolation: dev and pilot must have different project refs and URLs.');
  const allowed = config.allowedRedirects;
  if (!Array.isArray(allowed) || allowed.length !== redirects.length ||
      !redirects.every(value => allowed.includes(value)))
    errors.push('allowedRedirects: require exactly the canonical HTTPS auth callback and existing native callback; no wildcards or dev redirects.');
  return errors;
};

const fail = message => {
  process.stderr.write(`LOCAL CONFIG INVALID: ${message}\n`);
  process.exitCode = 1;
};
const args = process.argv.slice(2);
if (args.length !== 1 || !args[0].endsWith('.json')) {
  fail('Usage: node tools/pilot-config/validate.mjs <public-config.json>. No env files or secret arguments.');
} else {
  let config;
  try {
    config = JSON.parse(readFileSync(args[0], 'utf8'));
  } catch {
    fail('Cannot read a valid public JSON config. Check the file and syntax; input and parser errors are withheld.');
  }
  if (!process.exitCode) {
    const errors = validate(config);
    if (errors.length) fail(errors.join('\n'));
    else process.stdout.write('LOCAL CONFIG VALID ONLY. Remote project identity, Frankfurt database region, log/backup regions, DNS/TLS, Auth, quotas, wakeup, monitoring and restore are NOT VERIFIED. Pilot readiness remains gated.\n');
  }
}

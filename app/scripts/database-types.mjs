import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import prettier from 'prettier';

const app = fileURLToPath(new URL('..', import.meta.url));
const target = path.join(app, 'src/lib/database.types.ts');
const workdir = process.env.SUPABASE_WORKDIR ?? path.resolve(app, '..');
const result = spawnSync(
  path.join(app, 'node_modules/.bin/supabase'),
  [
    '--workdir',
    workdir,
    'gen',
    'types',
    'typescript',
    '--local',
    '--schema',
    'public',
  ],
  {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
  },
);
if (result.status !== 0) {
  process.stderr.write(
    result.stderr || result.error?.message || 'Type generation failed',
  );
  process.exit(1);
}
const source = ts.createSourceFile(
  target,
  result.stdout,
  ts.ScriptTarget.Latest,
);
const printed = ts.createPrinter({ removeComments: true }).printFile(source);
const options = await prettier.resolveConfig(target);
const output = await prettier.format(printed, { ...options, filepath: target });
if (process.argv.includes('--check')) {
  const current = await readFile(target, 'utf8').catch(() => '');
  if (current !== output) {
    process.stderr.write('Database types are stale. Run npm run db:types.\n');
    process.exit(1);
  }
  process.stdout.write('Database types match the local schema.\n');
} else {
  await writeFile(target, output);
  process.stdout.write('Generated src/lib/database.types.ts.\n');
}

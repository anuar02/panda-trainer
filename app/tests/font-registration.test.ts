import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

test('every named application font is registered before rendering', () => {
  const root = readFileSync(resolve(__dirname, '../app/_layout.tsx'), 'utf8');
  const registration = root.match(/useFonts\(\{([\s\S]*?)\}\)/)?.[1];
  expect(registration).toBeDefined();
  const loaded = new Set(registration?.match(/(?:Inter|Montserrat)_\w+/g));
  const used = new Set(
    sourceFiles(resolve(__dirname, '../src')).flatMap(
      (path) =>
        readFileSync(path, 'utf8').match(/(?:Inter|Montserrat)_\w+/g) ?? [],
    ),
  );
  expect(used.size).toBeGreaterThan(0);
  expect([...used].filter((font) => !loaded.has(font))).toEqual([]);
});

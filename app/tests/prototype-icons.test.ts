import fs from 'node:fs';
import path from 'node:path';
import paths from '../src/ui/icons/paths.json';

test('every glyph retains the original prototype geometry', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../prototype-fresh/js/icons.js'),
    'utf8',
  );
  const reference = Object.fromEntries(
    [...source.matchAll(/^\s{4}(\w+): '(.*)',?$/gm)].map((match) => [
      match[1],
      match[2],
    ]),
  );
  expect(Object.keys(reference).length).toBeGreaterThan(50);
  expect(paths).toEqual(reference);
});

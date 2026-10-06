import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tokens from '../src/ui/tokens.json';
import { motion } from '../src/ui/motion';

type Specification = {
  variables: Record<string, string>;
  classes: Record<string, Record<string, string>>;
};

describe.each(['light', 'dark'] as const)('%s prototype tokens', (scheme) => {
  const spec = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        `../../prototype-fresh/review/parity/spec-${scheme}.json`,
      ),
      'utf8',
    ),
  ) as Specification;

  test.each([
    ['canvas', '--canvas'],
    ['surface', '--surface'],
    ['sunken', '--sunken'],
    ['ink', '--ink'],
    ['secondary', '--sec'],
    ['border', '--border'],
    ['accent', '--accent'],
    ['warning', '--amber-ink'],
    ['danger', '--danger'],
  ] as const)('%s matches the recorded color', (name, variable) => {
    expect(tokens.colors[scheme][name]).toBe(spec.variables[variable]);
  });

  test.each(['button', 'field', 'card', 'sheet'] as const)(
    '%s matches the recorded radius',
    (name) => {
      expect(`${tokens.radius[name]}px`).toBe(spec.variables[`--r-${name}`]);
    },
  );

  test('sheet duration matches the recorded prototype', () => {
    expect(`${motion.sheetDuration}ms`).toBe(spec.variables['--dur-sheet']);
  });

  test('body size and line height match the base card text', () => {
    expect(`${tokens.fontSize.body}px`).toBe(spec.classes.card?.['font-size']);
    expect(`${tokens.lineHeight.body}px`).toBe(
      spec.classes.card?.['line-height'],
    );
  });
});

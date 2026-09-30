import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tokens from '../src/ui/tokens.json';
import { parity } from '../src/ui/parity-tokens';

type Specification = {
  variables: Record<string, string>;
  classes: Record<string, Record<string, string>>;
};

describe.each(['light', 'dark'] as const)(
  '%s shared prototype primitives',
  (scheme) => {
    const spec = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          `../../prototype-fresh/review/parity/spec-${scheme}.json`,
        ),
        'utf8',
      ),
    ) as Specification;

    test('screen title uses the recorded Montserrat weight, size and leading', () => {
      const title = spec.classes['today-head__title'];
      expect(title?.['font-family']).toContain('Montserrat');
      expect(title?.['font-weight']).toBe('800');
      expect(tokens.font.heading).toBe('Montserrat_800ExtraBold');
      expect(`${tokens.fontSize.title}px`).toBe(title?.['font-size']);
      expect(`${tokens.lineHeight.title}px`).toBe(title?.['line-height']);
    });

    test('card and primary button preserve recorded shadows and height', () => {
      expect(parity[scheme].cardShadow).toBe(spec.variables['--shadow-card']);
      expect(parity.button.shadow).toBe(spec.variables['--shadow-accent']);
      expect(`${tokens.size.button}px`).toBe(
        spec.classes['btn--primary']?.['min-height'],
      );
    });

    test.each([
      ['success', '--mint-ink', '--mint-soft'],
      ['warning', '--amber-ink', '--amber-soft'],
      ['danger', '--danger', '--danger-soft'],
      ['accent', '--accent-ink', '--accent-soft'],
      ['neutral', '--sec', '--sunken'],
    ] as const)('%s pill uses recorded colors', (tone, ink, background) => {
      if (scheme === 'light' && tone === 'success') {
        expect(parity[scheme][tone].color).toBe('#0c7734');
      } else {
        expect(parity[scheme][tone].color).toBe(spec.variables[ink]);
      }
      expect(parity[scheme][tone].backgroundColor).toBe(
        spec.variables[background],
      );
    });
  },
);

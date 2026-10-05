import { getWorkoutStyles } from '../src/features/workout/measurements';
import { tokens } from '../src/ui/theme';
import { originalDarkWorkoutStyles } from './fixtures/workout-dark-styles';

test('preserves every original dark style value', () => {
  expect(getWorkoutStyles(1, 390, tokens.colors.dark)).toEqual(
    originalDarkWorkoutStyles,
  );
});

test.each(['light', 'dark'] as const)(
  'builds %s styles including accessible layout',
  (scheme) => {
    const colors = tokens.colors[scheme];
    for (const [scale, width] of [
      [1, 390],
      [2, 320],
    ] as const) {
      const styles = getWorkoutStyles(scale, width, colors);
      expect(styles.root.backgroundColor).toBe(colors.canvas);
      expect(styles.field.backgroundColor).toBe(colors.surface);
      expect(styles.input.color).toBe(colors.ink);
      expect(styles.secondary.color).toBe(colors.secondary);
      expect(styles.participantActive.borderColor).toBe(colors.accent);
      expect(styles.chipActive.backgroundColor).not.toBe(
        styles.chip.backgroundColor,
      );
    }
  },
);

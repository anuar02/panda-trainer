import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

test.each(['front', 'wave', 'sit', 'clipboard', 'face-calm', 'sleep'])(
  '%s mascot is the unchanged canonical prototype asset',
  (pose) => {
    const source = readFileSync(
      resolve(__dirname, `../../prototype-fresh/assets/mascot/${pose}.png`),
    );
    const bundled = readFileSync(
      resolve(__dirname, `../assets/mascot/${pose}.png`),
    );
    expect(bundled.equals(source)).toBe(true);
  },
);

test.each(['images', 'videos'])(
  'exercise %s are the unchanged canonical prototype assets',
  (kind) => {
    const sourceDirectory = resolve(
      __dirname,
      `../../prototype-fresh/assets/exercises/${kind}`,
    );
    const files = readdirSync(sourceDirectory);
    expect(files).toHaveLength(12);
    for (const file of files) {
      const source = readFileSync(resolve(sourceDirectory, file));
      const bundled = readFileSync(
        resolve(__dirname, '../assets/exercises', file),
      );
      expect(bundled.equals(source)).toBe(true);
    }
  },
);

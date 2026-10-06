import tokens from '../src/ui/tokens.json';
function luminance(hex: string) {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  const [red = 0, green = 0, blue = 0] = channels;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
function contrast(a: string, b: string) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
for (const [scheme, colors] of Object.entries(tokens.colors)) {
  describe(scheme, () => {
    for (const background of ['canvas', 'surface', 'sunken'] as const) {
      test.each([
        'ink',
        'secondary',
        'accent',
        'success',
        'warning',
        'danger',
      ] as const)(`%s text meets AA on ${background}`, (foreground) => {
        expect(
          contrast(colors[foreground], colors[background]),
        ).toBeGreaterThanOrEqual(4.5);
      });
      test(`control border is visible on ${background}`, () => {
        expect(
          contrast(colors.control, colors[background]),
        ).toBeGreaterThanOrEqual(3);
      });
    }
  });
}

function composite(value: string, background: string) {
  if (value.startsWith('#')) return value;
  const [red = 0, green = 0, blue = 0, alpha = 1] = value
    .match(/[\d.]+/g)!
    .map(Number);
  return (
    '#' +
    [red, green, blue]
      .map((channel, index) => {
        const base = parseInt(
          background.slice(1 + index * 2, 3 + index * 2),
          16,
        );
        return Math.round(channel * alpha + base * (1 - alpha))
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

for (const [scheme, colors] of Object.entries(tokens.colors)) {
  describe(`${scheme} workout roles`, () => {
    const focus = colors.surface;
    const backgrounds = {
      canvas: colors.canvas,
      surface: focus,
      composer: colors.sunken,
      selected: composite(colors.workoutAccentSoft, focus),
      rest: composite(
        colors.workoutAccentSoft,
        composite(colors.workoutAccentSoft, focus),
      ),
      completedRest: composite(colors.workoutSuccessSoft, focus),
      notes: composite(colors.workoutNotes, colors.canvas),
    };
    for (const [role, background] of Object.entries(backgrounds)) {
      test.each(['ink', 'secondary', 'workoutAccentInk'] as const)(
        `%s meets AA on ${role}`,
        (foreground) => {
          expect(
            contrast(colors[foreground], background),
          ).toBeGreaterThanOrEqual(4.5);
        },
      );
    }
    test.each(['canvas', 'surface', 'composer', 'selected'] as const)(
      'success and error meet AA on %s',
      (role) => {
        expect(
          contrast(colors.success, backgrounds[role]),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(colors.danger, backgrounds[role]),
        ).toBeGreaterThanOrEqual(4.5);
      },
    );
    test('note icon has AA contrast on notes', () => {
      expect(
        contrast(colors.workoutNoteInk, backgrounds.notes),
      ).toBeGreaterThanOrEqual(4.5);
    });
    if (scheme === 'light') {
      test('placeholder and active exercise number meet AA', () => {
        expect(
          contrast(colors.workoutPlaceholder, colors.surface),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(colors.workoutOnAccent, colors.accent),
        ).toBeGreaterThanOrEqual(4.5);
      });
      test('white selected number and voice text meet AA', () => {
        for (const background of [
          colors.accent,
          colors.workoutVoiceStart,
          colors.workoutVoiceEnd,
        ]) {
          expect(contrast('#ffffff', background)).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  });
}

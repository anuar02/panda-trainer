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

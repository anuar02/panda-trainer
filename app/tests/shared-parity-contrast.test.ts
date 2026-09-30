import tokens from '../src/ui/tokens.json';
import { parity } from '../src/ui/parity-tokens';

function rgb(hex: string) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

function luminance(channels: number[]) {
  return channels
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce(
      (sum, value, index) =>
        sum + value * ([0.2126, 0.7152, 0.0722][index] ?? 0),
      0,
    );
}

test.each(['surface', 'canvas'] as const)(
  'light success pill meets AA after alpha compositing on %s',
  (surface) => {
    const base = rgb(tokens.colors.light[surface]);
    const values =
      parity.light.success.backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
    const alpha = values[3] ?? 0;
    const composed = values
      .slice(0, 3)
      .map(
        (channel, index) => channel * alpha + (base[index] ?? 0) * (1 - alpha),
      );
    const contrast =
      (luminance(composed) + 0.05) /
      (luminance(rgb(parity.light.success.color)) + 0.05);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  },
);

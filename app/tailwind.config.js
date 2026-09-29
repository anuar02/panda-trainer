const tokens = require('./src/ui/tokens.json');
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: Object.fromEntries(
        Object.keys(tokens.colors.light).map((key) => [
          key,
          `var(--color-${key})`,
        ]),
      ),
      fontFamily: Object.fromEntries(
        Object.entries(tokens.font).map(([key, value]) => [key, [value]]),
      ),
      borderRadius: Object.fromEntries(
        Object.entries(tokens.radius).map(([key, value]) => [
          key,
          `${value}px`,
        ]),
      ),
      spacing: {
        ...Object.fromEntries(
          Object.entries(tokens.spacing).map(([key, value]) => [
            key,
            `${value}px`,
          ]),
        ),
        touch: `${tokens.size.touch}px`,
        button: `${tokens.size.button}px`,
      },
      fontSize: {
        body: [
          `${tokens.fontSize.body}px`,
          { lineHeight: `${tokens.lineHeight.body}px` },
        ],
        title: [
          `${tokens.fontSize.title}px`,
          {
            lineHeight: `${tokens.lineHeight.title}px`,
            letterSpacing: '-0.5px',
          },
        ],
      },
    },
  },
  plugins: [],
};

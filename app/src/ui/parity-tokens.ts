export const parity = {
  light: {
    cardShadow:
      '0 1px 1px rgba(15, 18, 40, 0.04), 0 8px 24px -12px rgba(15, 18, 40, 0.18), 0 0 0 1px rgba(15, 18, 40, 0.05)',
    success: { color: '#0c7734', backgroundColor: 'rgba(22, 163, 74, 0.12)' },
    warning: { color: '#85560a', backgroundColor: 'rgba(255, 178, 61, 0.2)' },
    danger: { color: '#c62828', backgroundColor: 'rgba(198, 40, 40, 0.09)' },
    accent: { color: '#2238b0', backgroundColor: 'rgba(43, 72, 214, 0.1)' },
    neutral: { color: '#545868', backgroundColor: '#ebebe7' },
  },
  dark: {
    cardShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 0 0 1px #2a2b31',
    success: { color: '#3ddc97', backgroundColor: 'rgba(61, 220, 151, 0.13)' },
    warning: { color: '#f5c451', backgroundColor: 'rgba(245, 196, 81, 0.14)' },
    danger: { color: '#ff5a4e', backgroundColor: 'rgba(255, 90, 78, 0.13)' },
    accent: { color: '#8c9eff', backgroundColor: 'rgba(111, 134, 255, 0.16)' },
    neutral: { color: '#a3a4ab', backgroundColor: '#1d1e23' },
  },
  button: {
    gradientStart: '#2e4be0',
    gradientEnd: '#2136b0',
    shadow:
      '0 10px 22px -10px rgba(43, 72, 214, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
  },
} as const;

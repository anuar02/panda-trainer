jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View, Easing } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: {
      ...Easing,
      bezier: (...values: Parameters<typeof Easing.bezier>) => ({
        factory: () => Easing.bezier(...values),
      }),
    },
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    useSharedValue: (value: number) =>
      React.useRef({
        value,
        set(next: number) {
          this.value = next;
        },
      }).current,
    useAnimatedStyle: (style: () => object) => style(),
    cancelAnimation: jest.fn(),
    withDelay: jest.fn((_delay: number, value: number) => value),
    withRepeat: jest.fn((value: number) => value),
    withTiming: jest.fn((value: number) => value),
  };
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Image, type ImageProps } from 'expo-image';
import { AppState, type AppStateStatus, StyleSheet, View } from 'react-native';
import { Mascot } from '../src/ui/mascot';
import {
  clipForPlace,
  mascotClips,
  type ClipPlace,
} from '../src/ui/mascot/clips';
import { ClipImage } from '../src/ui/mascot/clip-image';

let mockCalm = false;
let mockReduced = false;
let mockFocused = true;
let mockDisposed = 0;
jest.mock('../src/ui/calm-mode', () => ({ useCalmMode: () => mockCalm }));
jest.mock('../src/ui/motion', () => ({
  useSystemReduceMotion: () => mockReduced,
}));
jest.mock('../src/ui/mascot/png-motion', () => {
  const { View: MockView } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useMascotFocus: () => mockFocused,
    PngMotion: (props: object) => <MockView {...props} testID="png-motion" />,
  };
});
jest.mock('expo-image', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View: MockView } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: jest.fn((props: ImageProps) => {
      React.useEffect(
        () => () => {
          if (props.autoplay) mockDisposed++;
        },
        [props.autoplay],
      );
      return (
        <MockView {...props} testID={props.autoplay ? 'clip' : 'poster'} />
      );
    }),
  };
});
beforeEach(() => {
  mockCalm = false;
  mockReduced = false;
  mockFocused = true;
  mockDisposed = 0;
  jest.clearAllMocks();
});
const expected: Record<ClipPlace, string[]> = {
  onboarding: ['wave', 'thumbs'],
  celebration: ['jump'],
  empty: ['sit', 'sleep'],
  invitation: ['wave', 'sit', 'thumbs'],
  'inbox-clear': ['sit'],
  'client-hero': ['wave'],
};
test.each(Object.entries(expected))(
  '%s only opts its approved poses into clips',
  (place, allowed) => {
    for (const pose of [
      ...Object.keys(mascotClips),
      'clipboard',
      'front',
      'front-idle',
      'calm',
      'smile',
    ]) {
      expect(
        Boolean(clipForPlace(pose, place as ClipPlace, false, false)),
      ).toBe(allowed.includes(pose));
      expect(
        clipForPlace(pose, place as ClipPlace, true, false),
      ).toBeUndefined();
      expect(
        clipForPlace(pose, place as ClipPlace, false, true),
      ).toBeUndefined();
      expect(clipForPlace(pose, undefined, false, false)).toBeUndefined();
    }
  },
);
test('stretch and listen are registered without screen placements', () => {
  expect(Object.keys(mascotClips)).toEqual([
    'wave',
    'thumbs',
    'jump',
    'sit',
    'sleep',
    'stretch',
    'listen',
  ]);
  for (const place of Object.keys(expected) as ClipPlace[]) {
    expect(clipForPlace('stretch', place, false, false)).toBeUndefined();
    expect(clipForPlace('listen', place, false, false)).toBeUndefined();
  }
});
test('loading and decode errors preserve poster geometry and drop the decoder', async () => {
  await render(
    <Mascot
      pose="wave"
      clipPlace="onboarding"
      size={220}
      style={{ height: 230 }}
    />,
  );
  const clip = screen.getByTestId('clip');
  expect(screen.getByTestId('poster').props.source).toBe(
    mascotClips.wave.poster,
  );
  expect(StyleSheet.flatten(clip.parent?.props.style)).toEqual({
    width: 220,
    height: 230,
  });
  expect(clip.props.cachePolicy).toBe('none');
  expect(clip.props.source).toBe(mascotClips.wave.source);
  expect(StyleSheet.flatten(clip.props.style).opacity).toBe(0);
  await fireEvent(clip, 'display');
  expect(screen.queryByTestId('poster')).toBeNull();
  await fireEvent(screen.getByTestId('clip'), 'error', { error: 'decode' });
  expect(screen.queryByTestId('clip')).toBeNull();
  expect(screen.getByTestId('poster').props.source).toBe(
    mascotClips.wave.poster,
  );
  expect(mockDisposed).toBe(1);
});
test.each(['calm', 'reduced'])(
  '%s never mounts or loads an animated source',
  async (mode) => {
    if (mode === 'calm') mockCalm = true;
    else mockReduced = true;
    await render(
      <Mascot pose="sleep" clipPlace="empty" context="empty" size={170} />,
    );
    expect(screen.queryByTestId('clip')).toBeNull();
    expect(screen.getByTestId('poster').props.source).toBe(
      require('../assets/mascot/sleep.png'),
    );
    expect(Image).toHaveBeenCalledTimes(1);
  },
);
test('unknown calm context retains the existing hiding rule', async () => {
  mockCalm = true;
  await render(<Mascot pose="wave" clipPlace="onboarding" size={220} />);
  expect(screen.toJSON()).toBeNull();
  expect(Image).not.toHaveBeenCalled();
});
test('reduce motion toggles dispose an already mounted clip', async () => {
  const view = await render(
    <Mascot pose="wave" clipPlace="onboarding" size={220} />,
  );
  mockReduced = true;
  await view.rerender(<Mascot pose="wave" clipPlace="onboarding" size={220} />);
  expect(screen.queryByTestId('clip')).toBeNull();
  expect(screen.getByTestId('poster').props.source).toBe(
    require('../assets/mascot/wave.png'),
  );
  expect(mockDisposed).toBe(1);
});
test('blur removes every decoder and refocus starts fresh at the poster', async () => {
  const content = () => (
    <View>
      {Array.from({ length: 3 }, (_, index) => (
        <Mascot key={index} pose="sit" clipPlace="empty" size={170} />
      ))}
    </View>
  );
  const view = await render(content());
  expect(screen.getAllByTestId('clip')).toHaveLength(3);
  mockFocused = false;
  await view.rerender(content());
  expect(screen.queryByTestId('clip')).toBeNull();
  expect(mockDisposed).toBe(3);
  mockFocused = true;
  await view.rerender(content());
  expect(screen.getAllByTestId('clip')).toHaveLength(3);
  expect(screen.getAllByTestId('poster')).toHaveLength(3);
  await view.unmount();
  expect(mockDisposed).toBe(6);
});
test('background removes the decoder and unsubscribes on unmount', async () => {
  const remove = jest.fn();
  let change: (state: AppStateStatus) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    change = listener;
    return { remove };
  });
  const view = await render(
    <ClipImage
      source={mascotClips.jump.source}
      poster={mascotClips.jump.poster}
      size={170}
    />,
  );
  await act(() => change('background'));
  expect(screen.queryByTestId('clip')).toBeNull();
  expect(mockDisposed).toBe(1);
  await act(() => change('active'));
  expect(screen.getByTestId('clip')).toBeTruthy();
  await view.unmount();
  expect(mockDisposed).toBe(2);
  expect(remove).toHaveBeenCalledTimes(1);
  jest.restoreAllMocks();
});
test('poses without a placement and rejected clipboard retain PNG motion', async () => {
  await render(
    <View>
      <Mascot pose="clipboard" clipPlace="client-hero" size={92} />
      <Mascot pose="wave" size={170} />
      <Mascot pose="front" size={36} />
    </View>,
  );
  expect(screen.queryByTestId('clip')).toBeNull();
  expect(screen.getAllByTestId('png-motion')).toHaveLength(3);
});

test('a new pose retries after the preceding clip failed', async () => {
  const view = await render(
    <Mascot pose="wave" clipPlace="onboarding" size={170} />,
  );
  await fireEvent(screen.getByTestId('clip'), 'error', { error: 'decode' });
  expect(screen.queryByTestId('clip')).toBeNull();
  await view.rerender(
    <Mascot pose="thumbs" clipPlace="onboarding" size={170} />,
  );
  expect(screen.getByTestId('clip').props.source).toBe(
    mascotClips.thumbs.source,
  );
  expect(screen.getByTestId('poster').props.source).toBe(
    mascotClips.thumbs.poster,
  );
});

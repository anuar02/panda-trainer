export const mascotClips = {
  wave: {
    source: require('../../../assets/mascot/clips/wave.webp'),
    poster: require('../../../assets/mascot/clips/wave-poster.png'),
  },
  thumbs: {
    source: require('../../../assets/mascot/clips/thumbs.webp'),
    poster: require('../../../assets/mascot/clips/thumbs-poster.png'),
  },
  jump: {
    source: require('../../../assets/mascot/clips/jump.webp'),
    poster: require('../../../assets/mascot/clips/jump-poster.png'),
  },
  sit: {
    source: require('../../../assets/mascot/clips/sit.webp'),
    poster: require('../../../assets/mascot/clips/sit-poster.png'),
  },
  sleep: {
    source: require('../../../assets/mascot/clips/sleep.webp'),
    poster: require('../../../assets/mascot/clips/sleep-poster.png'),
  },
  stretch: {
    source: require('../../../assets/mascot/clips/stretch.webp'),
    poster: require('../../../assets/mascot/clips/stretch-poster.png'),
  },
  listen: {
    source: require('../../../assets/mascot/clips/listen.webp'),
    poster: require('../../../assets/mascot/clips/listen-poster.png'),
  },
};

export type ClipPose = keyof typeof mascotClips;
const places = {
  onboarding: ['wave', 'thumbs'],
  celebration: ['jump'],
  empty: ['sit', 'sleep'],
  invitation: ['wave', 'sit', 'thumbs'],
  'inbox-clear': ['sit'],
  'client-hero': ['wave'],
} satisfies Record<string, readonly ClipPose[]>;
export type ClipPlace = keyof typeof places;

export function clipForPlace(
  pose: string,
  place: ClipPlace | undefined,
  calm: boolean,
  reduced: boolean,
) {
  if (
    !place ||
    calm ||
    reduced ||
    !places[place].some((value) => value === pose)
  )
    return undefined;
  return mascotClips[pose as ClipPose];
}

import { Image, type ImageProps } from 'expo-image';
import { Platform } from 'react-native';
import { lazy, Suspense } from 'react';
import { useCalmMode } from './calm-mode';
import { useSystemReduceMotion } from './motion';

const RiveMascot = lazy(() => import('./mascot/rive-mascot'));

const poses = {
  front: require('../../assets/mascot/front.png'),
  wave: require('../../assets/mascot/wave.png'),
  sit: require('../../assets/mascot/sit.png'),
  clipboard: require('../../assets/mascot/clipboard.png'),
  sleep: require('../../assets/mascot/sleep.png'),
  jump: require('../../assets/mascot/jump.png'),
  thumbs: require('../../assets/mascot/thumbs.png'),
  stretch: require('../../assets/mascot/stretch.png'),
  side: require('../../assets/mascot/side.png'),
  back: require('../../assets/mascot/back.png'),
  'three-quarter': require('../../assets/mascot/three-quarter.png'),
  calm: require('../../assets/mascot/face-calm.png'),
  neutral: require('../../assets/mascot/face-neutral.png'),
  laugh: require('../../assets/mascot/face-laugh.png'),
  excited: require('../../assets/mascot/face-excited.png'),
  smile: require('../../assets/mascot/face-smile.png'),
  worried: require('../../assets/mascot/face-worried.png'),
  surprised: require('../../assets/mascot/face-surprised.png'),
  sad: require('../../assets/mascot/face-sad.png'),
};

type Props = Omit<ImageProps, 'source'> & {
  pose: keyof typeof poses;
  size: number;
  hidden?: boolean;
};

export function Mascot({ pose, size, style, hidden = false, ...props }: Props) {
  const calmMode = useCalmMode();
  const reducedMotion = useSystemReduceMotion();
  if (hidden || calmMode) return null;
  const poster = (
    <Image
      accessible={false}
      contentFit="contain"
      {...props}
      source={poses[pose]}
      style={[{ width: size, height: size }, style]}
    />
  );
  if (
    reducedMotion ||
    process.env.EXPO_PUBLIC_MASCOT_RIVE !== 'true' ||
    Platform.OS === 'web' ||
    !['front', 'wave'].includes(pose)
  )
    return poster;
  return (
    <Suspense fallback={poster}>
      <RiveMascot pose={pose} size={size} style={style} fallback={poster} />
    </Suspense>
  );
}

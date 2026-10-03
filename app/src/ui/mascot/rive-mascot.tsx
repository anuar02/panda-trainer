import { useState, type ReactNode } from 'react';
import type { ImageProps } from 'expo-image';
import { View } from 'react-native';
import Rive, { Fit } from 'rive-react-native';

const source = require('../../../assets/mascot/red-panda-v5.riv');

type Props = {
  pose: string;
  size: number;
  style: ImageProps['style'];
  fallback: ReactNode;
};

export default function RiveMascot({ pose, size, style, fallback }: Props) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return (
    <View style={[{ width: size, height: size }, style]} accessible={false}>
      <Rive
        source={source}
        artboardName="Red Panda"
        animationName={pose === 'wave' ? 'Wave' : 'Idle'}
        fit={Fit.Contain}
        autoplay
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

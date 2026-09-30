import { Image, type ImageProps } from 'react-native';

const poses = {
  front: require('../../assets/mascot/front.png'),
  wave: require('../../assets/mascot/wave.png'),
  sit: require('../../assets/mascot/sit.png'),
  clipboard: require('../../assets/mascot/clipboard.png'),
  calm: require('../../assets/mascot/face-calm.png'),
  sleep: require('../../assets/mascot/sleep.png'),
};

type Props = Omit<ImageProps, 'source'> & {
  pose: keyof typeof poses;
  size: number;
};

export function Mascot({ pose, size, style, ...props }: Props) {
  return (
    <Image
      accessible={false}
      resizeMode="contain"
      {...props}
      source={poses[pose]}
      style={[{ width: size, height: size }, style]}
    />
  );
}

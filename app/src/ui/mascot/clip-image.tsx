import { Image, type ImageProps } from 'expo-image';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useMascotFocus } from './png-motion';

type Props = Omit<ImageProps, 'source'> & {
  source: ImageProps['source'];
  poster: ImageProps['source'];
  size: number;
};

export function ClipImage({ source, poster, size, style, ...props }: Props) {
  const focused = useMascotFocus();
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return (
    <View accessible={false} style={[{ width: size, height: size }, style]}>
      {focused && foreground ? (
        <PlayingClip
          key={String(source)}
          {...props}
          source={source}
          poster={poster}
        />
      ) : (
        <Image
          {...props}
          source={poster}
          accessible={false}
          contentFit="contain"
          contentPosition="bottom center"
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}

function PlayingClip({ source, poster, ...props }: Omit<Props, 'size'>) {
  const [displayed, setDisplayed] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      {!displayed && (
        <Image
          {...props}
          source={poster}
          accessible={false}
          contentFit="contain"
          contentPosition="bottom center"
          style={StyleSheet.absoluteFill}
        />
      )}
      {!failed && (
        <Image
          {...props}
          source={source}
          accessible={false}
          contentFit="contain"
          contentPosition="bottom center"
          cachePolicy="none"
          autoplay
          transition={0}
          onDisplay={() => setDisplayed(true)}
          onError={() => {
            setFailed(true);
            setDisplayed(false);
          }}
          style={[StyleSheet.absoluteFill, { opacity: displayed ? 1 : 0 }]}
        />
      )}
    </>
  );
}

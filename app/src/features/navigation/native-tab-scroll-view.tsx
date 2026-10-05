import type { ComponentProps } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { ScrollViewMarker } from 'react-native-screens/experimental';
import { MotionScrollView } from '@/ui/motion';
import { useNativeTabsInsets } from './tab-bar-layout';

const styles = StyleSheet.create({
  marker: { flex: 1 },
});

export function NativeTabScrollView(
  props: ComponentProps<typeof MotionScrollView>,
) {
  const nativeTabs = useNativeTabsInsets();
  if (!nativeTabs || Platform.OS !== 'ios' || props.horizontal) {
    return <MotionScrollView {...props} />;
  }
  return (
    <ScrollViewMarker style={styles.marker}>
      <MotionScrollView {...props} contentInsetAdjustmentBehavior="automatic" />
    </ScrollViewMarker>
  );
}

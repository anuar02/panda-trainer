import {
  StyleSheet,
  Text as NativeText,
  useWindowDimensions,
  type TextProps,
} from 'react-native';
import { extendTailwindMerge } from 'tailwind-merge';
const mergeClasses = extendTailwindMerge({
  extend: { classGroups: { 'font-size': ['text-title', 'text-body'] } },
});
export function Text({ className = '', style, ...props }: TextProps) {
  const { fontScale } = useWindowDimensions();
  return (
    <NativeText
      key={fontScale}
      className={mergeClasses(
        'font-body tabular-nums text-body text-ink',
        className,
      )}
      {...props}
      style={style ? { ...StyleSheet.flatten(style) } : undefined}
    />
  );
}

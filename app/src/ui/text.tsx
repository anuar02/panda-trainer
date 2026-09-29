import { Text as NativeText, type TextProps } from 'react-native';
import { extendTailwindMerge } from 'tailwind-merge';
const mergeClasses = extendTailwindMerge({
  extend: { classGroups: { 'font-size': ['text-title', 'text-body'] } },
});
export function Text({ className = '', ...props }: TextProps) {
  return (
    <NativeText
      className={mergeClasses(
        'font-body tabular-nums text-body text-ink',
        className,
      )}
      {...props}
    />
  );
}

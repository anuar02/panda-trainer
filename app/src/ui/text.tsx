import { Text as NativeText, type TextProps } from 'react-native';
import { extendTailwindMerge } from 'tailwind-merge';
const mergeClasses = extendTailwindMerge({
  extend: { classGroups: { 'font-size': ['text-title'] } },
});
export function Text({ className = '', ...props }: TextProps) {
  return (
    <NativeText
      className={mergeClasses(
        'font-body tabular-nums text-base leading-6 text-ink',
        className,
      )}
      {...props}
    />
  );
}

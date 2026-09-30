import { SvgXml } from 'react-native-svg';
import { Platform } from 'react-native';
import paths from './paths.json';
export type IconName = keyof typeof paths;
export function Icon({
  name,
  color,
  size = 24,
  strokeWidth = 2,
}: {
  name: IconName;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <SvgXml
      accessible={Platform.OS === 'web' ? undefined : false}
      aria-hidden
      width={size}
      height={size}
      color={color}
      xml={`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`}
    />
  );
}

import { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

type Radial = {
  color: string;
  opacity: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  stop?: number;
};

type Props = {
  testID?: string;
  start?: string;
  end?: string;
  startOpacity?: number;
  endOpacity?: number;
  radius?: number;
  radials?: readonly Radial[];
};

export function GradientBackground({
  testID,
  start,
  end,
  startOpacity = 1,
  endOpacity = 1,
  radius = 0,
  radials = [],
}: Props) {
  const id = useId().replace(/:/g, '');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const roundedRadius = Math.min(radius, size.width / 2, size.height / 2);
  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent: { layout } }) =>
        setSize((previous) =>
          previous.width === layout.width && previous.height === layout.height
            ? previous
            : { width: layout.width, height: layout.height },
        )
      }
    >
      {size.width > 0 && size.height > 0 && (
        <Svg
          testID={testID ? `${testID}-viewport` : undefined}
          width={size.width}
          height={size.height}
        >
          <Defs>
            {start && end && (
              <LinearGradient
                id={`${id}-linear`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <Stop
                  offset="0%"
                  stopColor={start}
                  stopOpacity={startOpacity}
                />
                <Stop offset="100%" stopColor={end} stopOpacity={endOpacity} />
              </LinearGradient>
            )}
            {radials.map((radial, index) => (
              <RadialGradient
                key={index}
                id={`${id}-radial-${index}`}
                gradientUnits="userSpaceOnUse"
                cx={0}
                cy={0}
                r={1}
                gradientTransform={`matrix(${radial.rx} 0 0 ${radial.ry} ${radial.cx * size.width} ${radial.cy * size.height})`}
              >
                <Stop
                  offset="0%"
                  stopColor={radial.color}
                  stopOpacity={radial.opacity}
                />
                <Stop
                  offset={`${(radial.stop ?? 1) * 100}%`}
                  stopColor={radial.color}
                  stopOpacity={0}
                />
              </RadialGradient>
            ))}
          </Defs>
          {start && end && (
            <Rect
              width={size.width}
              height={size.height}
              rx={roundedRadius}
              ry={roundedRadius}
              fill={`url(#${id}-linear)`}
            />
          )}
          {radials.map((_, index) => (
            <Rect
              key={index}
              width={size.width}
              height={size.height}
              rx={roundedRadius}
              ry={roundedRadius}
              fill={`url(#${id}-radial-${index})`}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}

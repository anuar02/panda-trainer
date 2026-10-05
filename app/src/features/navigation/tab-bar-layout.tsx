import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const TAB_BAR_HORIZONTAL_INSET = 12;
export const TAB_BAR_PADDING = 6;
export const TAB_BAR_RADIUS = 26;
export const TAB_BAR_MIN_HEIGHT = 54;
export const TAB_BAR_MIN_BOTTOM_OFFSET = 10;

export function estimatedTabBarHeight(
  role: 'trainer' | 'client',
  fontScale: number,
  bottomInset: number,
) {
  const fontSize = role === 'trainer' ? 10 : 12;
  const rowHeight = Math.max(
    TAB_BAR_MIN_HEIGHT,
    22 + 3 + fontSize * 1.45 * fontScale + 10,
  );
  return (
    rowHeight * (fontScale > 1.3 ? 2 : 1) +
    TAB_BAR_PADDING * 2 +
    Math.max(TAB_BAR_MIN_BOTTOM_OFFSET, bottomInset)
  );
}

type TabBarLayout = {
  bottomOffset: number;
  contentBottomInset: number;
  onTabBarLayout: (event: LayoutChangeEvent) => void;
};

const TabBarLayoutContext = createContext<TabBarLayout | null>(null);

export function TabBarLayoutProvider({
  role,
  children,
}: PropsWithChildren<{ role: 'trainer' | 'client' }>) {
  const { bottom } = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const [measurement, setMeasurement] = useState<{
    height: number;
    revision: string;
  } | null>(null);
  const revision = `${role}:${fontScale}:${bottom}`;
  const onTabBarLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      if (height <= 0) return;
      setMeasurement((previous) =>
        previous?.height === height && previous.revision === revision
          ? previous
          : { height, revision },
      );
    },
    [revision],
  );
  const contentBottomInset =
    measurement?.revision === revision
      ? measurement.height
      : estimatedTabBarHeight(role, fontScale, bottom);
  const value = useMemo(
    () => ({
      bottomOffset: Math.max(TAB_BAR_MIN_BOTTOM_OFFSET, bottom),
      contentBottomInset,
      onTabBarLayout,
    }),
    [bottom, contentBottomInset, onTabBarLayout],
  );
  return (
    <TabBarLayoutContext.Provider value={value}>
      {children}
    </TabBarLayoutContext.Provider>
  );
}

export function useTabBarLayout() {
  const layout = useContext(TabBarLayoutContext);
  if (!layout) throw new Error('TabBarLayoutProvider is required');
  return layout;
}

export function useTabContentBottomInset(contentPadding = 20) {
  const layout = useContext(TabBarLayoutContext);
  return contentPadding + (layout?.contentBottomInset ?? 0);
}

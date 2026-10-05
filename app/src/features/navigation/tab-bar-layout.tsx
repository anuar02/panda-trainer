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

export const TAB_BAR_FLOATING_GAP = 10;
export const TAB_BAR_CONTENT_GAP = 16;
export const TAB_BAR_PANEL_PADDING = 6;

export function getTabBarItemMinimumHeight(
  fontScale: number,
  fontSize: number,
) {
  return Math.max(54, 22 + 3 + fontSize * 1.45 * fontScale + 10);
}

type TabBarLayout = {
  bottomInset: number;
  panelBottom: number;
  panelHeight: number;
  onPanelLayout: (event: LayoutChangeEvent) => void;
  setPanelVisible: (visible: boolean) => void;
};

const TabBarLayoutContext = createContext<TabBarLayout | null>(null);
const fallbackLayout: TabBarLayout = {
  bottomInset: 0,
  panelBottom: 0,
  panelHeight: 0,
  onPanelLayout: () => {},
  setPanelVisible: () => {},
};

export function TabBarLayoutProvider({
  children,
  role = 'client',
}: PropsWithChildren<{ role?: 'trainer' | 'client' }>) {
  const { bottom } = useSafeAreaInsets();
  const { fontScale, width } = useWindowDimensions();
  const [measurement, setMeasurement] = useState<{
    height: number;
    fontScale: number;
    width: number;
  } | null>(null);
  const [visible, setPanelVisible] = useState(true);
  const panelBottom = Math.max(TAB_BAR_FLOATING_GAP, bottom);
  const estimatedHeight =
    getTabBarItemMinimumHeight(fontScale, role === 'trainer' ? 10 : 12) *
      (fontScale > 1.3 ? 2 : 1) +
    TAB_BAR_PANEL_PADDING * 2;
  const panelHeight =
    measurement?.fontScale === fontScale && measurement.width === width
      ? measurement.height
      : Math.max(measurement?.height ?? 0, estimatedHeight);
  const onPanelLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      if (Number.isFinite(height) && height > 0) {
        setMeasurement({ height, fontScale, width });
      }
    },
    [fontScale, width],
  );
  const value = useMemo(
    () => ({
      bottomInset: visible
        ? panelHeight + panelBottom + TAB_BAR_CONTENT_GAP
        : 0,
      panelBottom,
      panelHeight,
      onPanelLayout,
      setPanelVisible,
    }),
    [visible, panelHeight, panelBottom, onPanelLayout],
  );
  return (
    <TabBarLayoutContext.Provider value={value}>
      {children}
    </TabBarLayoutContext.Provider>
  );
}

export function useTabBarLayout() {
  return useContext(TabBarLayoutContext) ?? fallbackLayout;
}

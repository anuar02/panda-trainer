import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { vars } from 'nativewind';
import tokens from './tokens.json';
import { CalmModeProvider } from './calm-mode';
export type Appearance = 'auto' | 'light' | 'dark';
export type Role = 'trainer' | 'client';
export const appearanceStorageKey = 'panda-trainer.appearance';
type Theme = {
  appearance: Appearance;
  scheme: 'light' | 'dark';
  colors: typeof tokens.colors.light;
  setAppearance: (value: Appearance) => void;
};
const ThemeContext = createContext<Theme>({
  appearance: 'auto',
  scheme: 'light',
  colors: tokens.colors.light,
  setAppearance: (_value: Appearance) => {},
});
export function ThemeProvider({
  children,
  role = 'client',
}: PropsWithChildren<{ role?: Role; workout?: boolean }>) {
  const [appearance, updateAppearance] = useState<Appearance>('auto');
  const changed = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(appearanceStorageKey)
      .then((value) => {
        if (
          active &&
          !changed.current &&
          (value === 'auto' || value === 'light' || value === 'dark')
        )
          updateAppearance(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const setAppearance = useCallback((value: Appearance) => {
    changed.current = true;
    updateAppearance(value);
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(appearanceStorageKey, value))
      .catch(() => {});
  }, []);
  const scheme =
    appearance === 'auto'
      ? role === 'trainer'
        ? 'dark'
        : 'light'
      : appearance;
  const colors = useMemo(() => tokens.colors[scheme], [scheme]);
  const variables = useMemo(
    () =>
      vars(
        Object.fromEntries(
          Object.entries(colors).map(([key, value]) => [
            `--color-${key}`,
            value,
          ]),
        ),
      ),
    [colors],
  );
  const value = useMemo(
    () => ({ appearance, setAppearance, scheme, colors }),
    [appearance, scheme, colors, setAppearance],
  );
  return (
    <CalmModeProvider role={role}>
      <ThemeContext.Provider value={value}>
        <View className="flex-1 bg-canvas" style={variables}>
          {children}
        </View>
      </ThemeContext.Provider>
    </CalmModeProvider>
  );
}
export const useTheme = () => useContext(ThemeContext);
export { tokens };

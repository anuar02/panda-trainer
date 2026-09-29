import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme, View } from 'react-native';
import { vars } from 'nativewind';
import tokens from './tokens.json';
export type Appearance = 'system' | 'light' | 'dark';
type Theme = {
  appearance: Appearance;
  scheme: 'light' | 'dark';
  colors: typeof tokens.colors.light;
  setAppearance: (value: Appearance) => void;
};
const ThemeContext = createContext<Theme>({
  appearance: 'system',
  scheme: 'light',
  colors: tokens.colors.light,
  setAppearance: (_value: Appearance) => {},
});
export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [appearance, setAppearance] = useState<Appearance>('system');
  const scheme =
    appearance === 'system'
      ? system === 'dark'
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
    [appearance, scheme, colors],
  );
  return (
    <ThemeContext.Provider value={value}>
      <View className="flex-1 bg-canvas" style={variables}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
export { tokens };

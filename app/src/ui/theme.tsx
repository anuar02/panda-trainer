import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme, View } from 'react-native';
import { vars } from 'nativewind';
import tokens from './tokens.json';
export type Appearance = 'system' | 'light' | 'dark';
const ThemeContext = createContext({
  appearance: 'system' as Appearance,
  scheme: 'light' as 'light' | 'dark',
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
  const colors = tokens.colors[scheme];
  const variables = vars(
    Object.fromEntries(
      Object.entries(colors).map(([key, value]) => [`--color-${key}`, value]),
    ),
  );
  return (
    <ThemeContext.Provider
      value={{ appearance, setAppearance, scheme, colors }}
    >
      <View className="flex-1 bg-canvas" style={variables}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
export { tokens };

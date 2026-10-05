import { createContext, use, useContext, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { NavigationRouteContext } from 'expo-router/react-navigation';

const NativeTabsInsetsContext = createContext(false);

export function NativeTabsInsetsProvider({ children }: PropsWithChildren) {
  return (
    <NativeTabsInsetsContext.Provider value>
      {children}
    </NativeTabsInsetsContext.Provider>
  );
}

export function useTabBarLayout() {
  const nativeTabs = useContext(NativeTabsInsetsContext);
  const route = useContext(NavigationRouteContext);
  return {
    bottomInset:
      nativeTabs && Platform.OS === 'ios' && route?.name === 'today'
        ? (use(SafeAreaInsetsContext)?.bottom ?? 0)
        : 0,
  };
}

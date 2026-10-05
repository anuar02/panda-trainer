import { createContext, useContext, type PropsWithChildren } from 'react';

const NativeTabsInsetsContext = createContext(false);

export function NativeTabsInsetsProvider({ children }: PropsWithChildren) {
  return (
    <NativeTabsInsetsContext.Provider value>
      {children}
    </NativeTabsInsetsContext.Provider>
  );
}

export function useNativeTabsInsets() {
  return useContext(NativeTabsInsetsContext);
}

export function useTabBarLayout() {
  return { bottomInset: 0 };
}

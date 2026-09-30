import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './text';
import { tokens } from './theme';
const ToastContext = createContext<(message: string) => void>(() => {});
export function ToastProvider({ children }: PropsWithChildren) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((value: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(value);
    AccessibilityInfo.announceForAccessibility(value);
    timer.current = setTimeout(() => setMessage(null), tokens.duration.toast);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <View
          className="absolute left-page right-page rounded-card bg-ink p-4"
          style={{
            top: insets.top + tokens.spacing.page,
            pointerEvents: 'none',
          }}
        >
          <Text className="text-canvas">{message}</Text>
        </View>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

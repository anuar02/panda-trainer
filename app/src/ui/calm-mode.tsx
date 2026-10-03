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
import AsyncStorage from '@react-native-async-storage/async-storage';

type Role = 'trainer' | 'client';
export const calmModeStorageKey = (role: Role) => `panda-trainer.calm.${role}`;
const CalmContext = createContext({
  calmMode: false,
  ready: false,
  error: false,
  setCalmMode: (_value: boolean) => {},
});
export function CalmModeProvider({
  children,
  role,
}: PropsWithChildren<{ role: Role }>) {
  const [preferences, setPreferences] = useState({
    trainer: false,
    client: false,
  });
  const [ready, setReady] = useState({ trainer: false, client: false });
  const [error, setError] = useState({ trainer: false, client: false });
  const changed = useRef({ trainer: false, client: false });
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    for (const current of ['trainer', 'client'] as const) {
      void AsyncStorage.getItem(calmModeStorageKey(current))
        .then((value) => {
          if (!active) return;
          if (!changed.current[current])
            setPreferences((previous) => ({
              ...previous,
              [current]: value === 'true',
            }));
          setReady((previous) => ({ ...previous, [current]: true }));
        })
        .catch(() => {
          if (active)
            setError((previous) => ({ ...previous, [current]: true }));
        });
    }
    return () => {
      active = false;
    };
  }, []);
  const setCalmMode = useCallback(
    (value: boolean) => {
      changed.current[role] = true;
      setPreferences((previous) => ({ ...previous, [role]: value }));
      setReady((previous) => ({ ...previous, [role]: true }));
      writes.current = writes.current
        .then(() =>
          AsyncStorage.setItem(calmModeStorageKey(role), String(value)),
        )
        .then(() => setError((previous) => ({ ...previous, [role]: false })))
        .catch(() => setError((previous) => ({ ...previous, [role]: true })));
    },
    [role],
  );
  const value = useMemo(
    () => ({
      calmMode: preferences[role],
      ready: ready[role],
      error: error[role],
      setCalmMode,
    }),
    [preferences, ready, error, role, setCalmMode],
  );
  return <CalmContext.Provider value={value}>{children}</CalmContext.Provider>;
}
export const useCalmMode = () => useContext(CalmContext).calmMode;
export const useCalmModePreference = () => useContext(CalmContext);
export function useCelebrationsEnabled() {
  const { calmMode, ready } = useContext(CalmContext);
  return ready && !calmMode;
}

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

export function useWorkspaceClock() {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      const timer = setInterval(() => setNow(new Date()), 60000);
      return () => clearInterval(timer);
    }, []),
  );
  return now;
}

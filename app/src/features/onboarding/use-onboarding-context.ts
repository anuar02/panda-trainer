import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/features/auth/provider';
import { loadOnboardingContext, type OnboardingContext } from './service';

type LoadedContext = {
  key: string;
  context: OnboardingContext | null;
  failed: boolean;
};

export function useOnboardingContext() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadedContext | null>(null);
  const key = `${userId ?? ''}:${attempt}`;

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      setLoaded(null);
      let active = true;
      void loadOnboardingContext().then(
        (context) => {
          if (active)
            setLoaded({
              key,
              context: context.userId === userId ? context : null,
              failed: context.userId !== userId,
            });
        },
        () => {
          if (active) setLoaded({ key, context: null, failed: true });
        },
      );
      return () => {
        active = false;
      };
    }, [key, userId]),
  );

  const current = loaded?.key === key ? loaded : null;
  return {
    context: current?.context ?? null,
    failed: current?.failed ?? false,
    loading: Boolean(userId) && current === null,
    retry: () => setAttempt((value) => value + 1),
  };
}

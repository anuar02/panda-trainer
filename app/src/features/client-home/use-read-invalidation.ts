import { useLayoutEffect } from 'react';
import { getSupabaseClient } from '@/features/auth/client';

export function useClientReadInvalidation(invalidate: () => void) {
  useLayoutEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const subscription = client.auth.onAuthStateChange((event) => {
      if (event !== 'INITIAL_SESSION') invalidate();
    }).data.subscription;
    return () => subscription.unsubscribe();
  }, [invalidate]);
}

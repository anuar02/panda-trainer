import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { readConfirmedDeletion } from './pending';
export function AccountDeletionRecoveryEntry() {
  const [available, setAvailable] = useState(false);
  const { t } = useTranslation();
  useEffect(() => {
    let mounted = true;
    void readConfirmedDeletion().then(
      (intent) => {
        if (mounted) setAvailable(intent !== null);
      },
      () => {
        if (mounted) setAvailable(true);
      },
    );
    return () => {
      mounted = false;
    };
  }, []);
  if (!available) return null;
  return (
    <Button
      label={t('accountDeletion.recover')}
      variant="secondary"
      onPress={() => router.push('/auth/delete-account')}
    />
  );
}

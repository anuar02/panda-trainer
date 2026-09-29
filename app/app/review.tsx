import { useState } from 'react';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';
import { Field } from '@/ui/field';
import { Chip } from '@/ui/chip';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { Sheet } from '@/ui/sheet';
import { useToast } from '@/ui/toast';
import { LoadingState, ErrorState, OfflineState } from '@/ui/states';
export default function ReviewScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(true);
  const [value, setValue] = useState('');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen title={t('review.title')}>
      <Card>
        <Field
          label={t('review.field')}
          placeholder={t('review.placeholder')}
          value={value}
          onChangeText={setValue}
        />
        <Chip
          label={t('review.chip')}
          selected={selected}
          onPress={() => setSelected(!selected)}
        />
        <Button
          label={t('review.button')}
          onPress={() => toast(t('review.toast'))}
        />
        <Button
          label={t('review.sheet')}
          variant="secondary"
          onPress={() => setOpen(true)}
        />
      </Card>
      <OfflineState />
      <LoadingState />
      <ErrorState onRetry={() => toast(t('review.toast'))} />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('review.sheetTitle')}
      >
        <Text>{t('review.sheetBody')}</Text>
      </Sheet>
    </Screen>
  );
}

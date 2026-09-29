import { useTranslation } from 'react-i18next';
import { Screen } from '@/ui/screen';
import { EmptyState } from '@/ui/states';
import { Card } from '@/ui/card';
export type Section =
  'today' | 'clients' | 'templates' | 'home' | 'workouts' | 'progress';
export function PlaceholderScreen({ section }: { section: Section }) {
  const { t } = useTranslation();
  return (
    <Screen title={t(`tabs.${section}`)}>
      <Card>
        <EmptyState
          title={t(`empty.${section}.title`)}
          description={t(`empty.${section}.description`)}
        />
      </Card>
    </Screen>
  );
}

import { useTranslation } from 'react-i18next';
import { Screen } from '@/ui/screen';
export default function Route() {
  const { t } = useTranslation();
  return <Screen title={t('tabs.schedule').replace('\u00ad', '')} />;
}

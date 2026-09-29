import { useTranslation } from 'react-i18next';
import { Screen } from '@/ui/screen';
export default function Route() {
  const { t } = useTranslation();
  return <Screen title={t('tabs.history').replace('\u00ad', '')} />;
}

import { TemplateStorageGate } from '@/features/template-editor/storage-gate';
import { useOptionalTemplates } from '@/features/template-editor/provider';
import { useTemplateLauncher } from '@/features/template-editor/launcher';
import { router, useLocalSearchParams } from 'expo-router';
import { routeScalar } from '@/features/scheduling-demo/route-params';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
import { trainerLibrary } from '@/features/trainer-library/ru';
import { TemplateScreen } from '@/features/trainer-library/template-screen';

export function generateStaticParams() {
  return trainerLibrary.templateData.map(({ id }) => ({ id }));
}

export default function TemplateRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const scenario = useDemoScenario();
  const store = useOptionalTemplates();
  const launcher = useTemplateLauncher();
  return (
    <TemplateStorageGate>
      <TemplateScreen
        templates={store?.templates}
        onEdit={
          launcher.enabled ? () => launcher.start(routeScalar(id)) : undefined
        }
        onCopy={
          launcher.enabled
            ? () => launcher.start(routeScalar(id), true)
            : undefined
        }
        id={routeScalar(id)}
        scenario={scenario}
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace('/(trainer)/library')
        }
        onUse={(templateId) =>
          router.push({ pathname: '/new', params: { templateId } })
        }
      />
      {launcher.conflict}
    </TemplateStorageGate>
  );
}

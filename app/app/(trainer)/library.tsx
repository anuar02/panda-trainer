import { TemplateStorageGate } from '@/features/template-editor/storage-gate';
import { useOptionalTemplates } from '@/features/template-editor/provider';
import { useTemplateLauncher } from '@/features/template-editor/launcher';
import { router, useLocalSearchParams } from 'expo-router';
import { useDemoScenario } from '@/features/demo/use-demo-scenario';
import { TrainerLibraryScreen } from '@/features/trainer-library/trainer-library-screen';
export default function Route() {
  const store = useOptionalTemplates();
  const launcher = useTemplateLauncher();
  const params = useLocalSearchParams<{ tab?: string }>();
  return (
    <TemplateStorageGate>
      <TrainerLibraryScreen
        key={params.tab}
        initialTab={params.tab === 'templates' ? 'templates' : 'exercises'}
        templates={store?.templates}
        draft={store?.draft}
        onCreate={launcher.enabled ? () => launcher.start() : undefined}
        onResume={launcher.resume}
        scenario={useDemoScenario()}
        onOpenTemplate={(id) =>
          router.push({ pathname: '/template/[id]', params: { id } })
        }
      />
      {launcher.conflict}
    </TemplateStorageGate>
  );
}

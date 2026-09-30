import { router } from 'expo-router';
import { TemplateEditorScreen } from '@/features/template-editor/screen';
export default function TemplateEditorRoute() {
  return (
    <TemplateEditorScreen
      onLeave={() =>
        router.replace({
          pathname: '/(trainer)/library',
          params: { tab: 'templates' },
        })
      }
      onSaved={(id) =>
        router.replace({ pathname: '/template/[id]', params: { id } })
      }
    />
  );
}

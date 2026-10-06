import type { Href } from 'expo-router';

export const workspaceTemplateEditorHref = (clientId?: string): Href =>
  clientId
    ? { pathname: '/workspace/library/editor', params: { clientId } }
    : '/workspace/library/editor';

export const workspaceTemplateLibraryHref = (clientId?: string): Href =>
  clientId
    ? {
        pathname: '/workspace/library',
        params: { clientId, tab: 'templates' },
      }
    : '/workspace/library';

export const workspaceTemplateRouteHref = (
  id: string,
  clientId?: string,
): Href =>
  clientId
    ? { pathname: '/workspace/library/template/[id]', params: { id, clientId } }
    : { pathname: '/workspace/library/template/[id]', params: { id } };

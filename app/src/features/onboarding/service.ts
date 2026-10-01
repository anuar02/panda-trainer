import type { Database } from '@/lib/database.types';
import { getSupabaseClient } from '@/features/auth/client';
import type { TrainerOnboardingDraft } from './welcome-model';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Workspace = Database['public']['Tables']['trainer_workspaces']['Row'];

export type OnboardingContext = {
  userId: string;
  profile: Profile | null;
  workspace: Workspace | null;
};

const focusCodes: Record<string, string> = {
  Силовые: 'strength',
  Функциональные: 'functional',
  Похудение: 'weight_loss',
  Реабилитация: 'rehabilitation',
  Бокс: 'boxing',
  Йога: 'yoga',
};

const contextError = () => new Error('Unable to load trainer onboarding');
const completionError = () =>
  new Error('Unable to complete trainer onboarding');

export const loadOnboardingContext = async (): Promise<OnboardingContext> => {
  const client = getSupabaseClient();
  if (!client) throw contextError();

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw contextError();

  const userId = data.user.id;
  const [profileResult, workspaceResult] = await Promise.all([
    client.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    client
      .from('trainer_workspaces')
      .select('*')
      .eq('owner_user_id', userId)
      .maybeSingle(),
  ]);

  if (profileResult.error || workspaceResult.error) throw contextError();

  return {
    userId,
    profile: profileResult.data,
    workspace: workspaceResult.data,
  };
};

export const completeTrainerOnboarding = async (
  draft: TrainerOnboardingDraft,
): Promise<OnboardingContext> => {
  const client = getSupabaseClient();
  if (!client) throw completionError();

  const selectedFocus = draft.focus.map((label) => {
    const code = focusCodes[label];
    if (!code) throw completionError();
    return code;
  });
  const displayName = draft.name.trim();
  const clientName = draft.clientName.trim();
  const clientPhone = draft.clientPhone.trim();
  const { data, error } = await client.rpc('complete_trainer_onboarding', {
    display_name: displayName,
    workspace_name: displayName,
    selected_focus: selectedFocus,
    selected_days: draft.days,
    starts_at: draft.from,
    ends_at: draft.to,
    session_minutes: draft.length,
    first_client_name: clientName || undefined,
    first_client_phone: clientPhone || undefined,
  });

  if (error || data === null) throw completionError();

  const context = await loadOnboardingContext();
  if (!context.workspace) throw completionError();
  return context;
};

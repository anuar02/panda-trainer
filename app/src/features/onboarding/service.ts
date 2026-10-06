import {
  isValidTrainerOnboardingDraft,
  type TrainerOnboardingDraft,
} from './welcome-model';
import {
  withOnboardingSession,
  onboardingFailure,
  type OnboardingScope,
} from './session';
import {
  focusCodes,
  parseProfile,
  parseWorkspace,
  parseConnections,
  validateConnectionCard,
  type Profile,
  type Workspace,
  type Connection,
} from './validation';

export type OnboardingContext = {
  userId: string;
  profile: Profile | null;
  workspace: Workspace | null;
  connections: Connection[];
};
type Read = Parameters<Parameters<typeof withOnboardingSession>[1]>[0];

async function readContext(read: Read): Promise<OnboardingContext> {
  await read.guard();
  const [profileResult, workspaceResult, connectionsResult] = await Promise.all(
    [
      read.client
        .from('profiles')
        .select('*')
        .eq('user_id', read.userId)
        .setHeader('Authorization', `Bearer ${read.token}`)
        .abortSignal(read.signal)
        .maybeSingle(),
      read.client
        .from('trainer_workspaces')
        .select('*')
        .eq('owner_user_id', read.userId)
        .setHeader('Authorization', `Bearer ${read.token}`)
        .abortSignal(read.signal)
        .maybeSingle(),
      read.client
        .rpc('list_my_client_connections')
        .setHeader('Authorization', `Bearer ${read.token}`)
        .abortSignal(read.signal),
    ],
  );
  await read.guard();
  if (profileResult.error || workspaceResult.error || connectionsResult.error)
    throw onboardingFailure();
  const profile = parseProfile(profileResult.data, read.userId);
  const workspace = parseWorkspace(workspaceResult.data, read.userId);
  const connections = parseConnections(connectionsResult.data);
  if (workspace && !profile) throw onboardingFailure();
  const cards = new Map<string, ReturnType<typeof validateConnectionCard>>();
  let total: number | undefined;
  for (let offset = 0; offset <= 10000; offset += 200) {
    await read.guard();
    const result = await read.client
      .from('client_records')
      .select(
        'id,workspace_id,user_id,display_name,phone,archived_at,revision,created_at,updated_at,created_by',
        { count: 'exact' },
      )
      .eq('user_id', read.userId)
      .is('archived_at', null)
      .order('id', { ascending: true })
      .range(offset, offset + 199)
      .setHeader('Authorization', `Bearer ${read.token}`)
      .abortSignal(read.signal);
    await read.guard();
    if (
      result.error ||
      !Array.isArray(result.data) ||
      result.count === null ||
      !Number.isSafeInteger(result.count) ||
      result.count < 0 ||
      result.count > 10000 ||
      (total !== undefined && total !== result.count) ||
      result.data.length !== Math.min(200, Math.max(0, result.count - offset))
    )
      throw onboardingFailure();
    total = result.count;
    for (const value of result.data) {
      const card = validateConnectionCard(value, read.userId);
      if (cards.has(card.id)) throw onboardingFailure();
      cards.set(card.id, card);
    }
    if (cards.size === total) break;
  }
  if (cards.size !== total || connections.length !== cards.size)
    throw onboardingFailure();
  for (const connection of connections) {
    const card = cards.get(connection.client_record_id);
    if (
      !card ||
      card.workspaceId !== connection.workspace_id ||
      card.name !== connection.client_name
    )
      throw onboardingFailure();
  }
  await read.guard();
  return { userId: read.userId, profile, workspace, connections };
}
async function verifyActor(read: Read) {
  await read.guard();
  const result = await read.client.auth.getUser(read.token);
  await read.guard();
  if (result.error || result.data.user?.id !== read.userId)
    throw onboardingFailure();
}
export const loadOnboardingContext = (
  scope: OnboardingScope,
): Promise<OnboardingContext> =>
  withOnboardingSession(scope, async (read) => {
    await verifyActor(read);
    return readContext(read);
  });

export const completeTrainerOnboarding = async (
  draft: TrainerOnboardingDraft,
  scope: OnboardingScope,
): Promise<OnboardingContext> => {
  const displayName = draft.name.trim();
  const clientName = draft.clientName.trim();
  const clientPhone = draft.clientPhone.trim();
  const selectedFocus = draft.focus.map((label) =>
    Object.hasOwn(focusCodes, label) ? focusCodes[label] : undefined,
  );
  if (!isValidTrainerOnboardingDraft(draft)) throw onboardingFailure();
  const payload = {
    display_name: displayName,
    workspace_name: displayName,
    selected_focus: selectedFocus as string[],
    selected_days: [...draft.days],
    starts_at: draft.from,
    ends_at: draft.to,
    session_minutes: draft.length,
    first_client_name: clientName || undefined,
    first_client_phone: clientPhone || undefined,
  };
  return withOnboardingSession(scope, async (read) => {
    await verifyActor(read);
    await read.guard();
    const result = await read.client
      .rpc('complete_trainer_onboarding', payload)
      .setHeader('Authorization', `Bearer ${read.token}`)
      .abortSignal(read.signal);
    await read.guard();
    if (result.error) throw onboardingFailure();
    const workspace = parseWorkspace(result.data, read.userId);
    if (!workspace) throw onboardingFailure();
    const context = await readContext(read);
    await read.guard();
    if (context.workspace?.id !== workspace.id || !context.profile)
      throw onboardingFailure();
    return context;
  });
};

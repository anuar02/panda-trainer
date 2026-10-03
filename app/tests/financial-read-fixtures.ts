export const financialSessionId = '93000000-0000-4000-8000-000000000001';
export function financialToken(
  userId: string,
  sessionId = financialSessionId,
  version = 1,
) {
  return `synthetic.${btoa(JSON.stringify({ sub: userId, session_id: sessionId, version })).replace(/=/g, '')}.fixture`;
}

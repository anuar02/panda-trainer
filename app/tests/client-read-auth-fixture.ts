export const clientReadToken = (
  userId: string,
  sessionId = '11000000-0000-4000-8000-000000000099',
  version = 'initial',
) =>
  `header.${Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, version })).toString('base64url')}.signature`;

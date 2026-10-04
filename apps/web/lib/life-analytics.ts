import { lifeApi, supabase, ClientError } from './client';
export type LifeInteraction =
  | 'onboarding_started'
  | 'life_opened'
  | 'chapter_end_reached'
  | 'continuation_clicked'
  | 'fork_clicked';
const fallback = new Map<string, string>();
export async function lifeSessionId() {
  const { data } = await supabase().auth.getSession();
  if (!data.session) throw new ClientError('AUTH_REQUIRED');
  const userId = data.session.user.id,
    key = `alterward.session:${userId}`;
  try {
    let id = sessionStorage.getItem(key);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    if (!fallback.has(userId)) fallback.set(userId, crypto.randomUUID());
    return fallback.get(userId)!;
  }
}
export async function trackLife(
  kind: LifeInteraction,
  branchId: string | null,
  periodId: string | null = null,
) {
  await lifeApi('/interactions', {
    method: 'POST',
    body: JSON.stringify({
      eventId: crypto.randomUUID(),
      sessionId: await lifeSessionId(),
      branchId,
      periodId,
      kind,
    }),
  });
}

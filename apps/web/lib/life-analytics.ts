import { lifeApi } from './client';
export type LifeInteraction =
  | 'onboarding_started'
  | 'life_opened'
  | 'chapter_end_reached'
  | 'continuation_clicked'
  | 'fork_clicked';
export async function trackLife(
  kind: LifeInteraction,
  branchId: string | null,
) {
  let sessionId = sessionStorage.getItem('alterward.session');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('alterward.session', sessionId);
  }
  await lifeApi('/interactions', {
    method: 'POST',
    body: JSON.stringify({
      eventId: crypto.randomUUID(),
      sessionId,
      branchId,
      kind,
    }),
  });
}

// Bounded open admission, web side. An account that signed in but is not yet
// admitted (or has not given the 18+/terms/privacy acknowledgement) sees a
// consent step instead of the generation UI; a full service shows a plain
// "full, opening later" page. The API stays the authority: this only routes the
// screen, it never grants access and fails closed on anything it cannot read.
export type AdmissionState =
  | { kind: 'checking' }
  | { kind: 'consent' }
  | { kind: 'admitted' }
  | { kind: 'full' }
  | { kind: 'error'; message: string };

// The single request body of POST /me/consent (the API requires both literals).
export const CONSENT_BODY = Object.freeze({
  adult: true,
  acknowledged: true,
}) as { readonly adult: true; readonly acknowledged: true };

// Pages that use the generation or personal-data API. The account-control pages
// (settings: export and deletion, and the public privacy page) stay reachable
// without admission, like the API's own account-control exception.
const GATED_PAGES = [
  'lives',
  'start',
  'life',
  'preview',
  'onboarding',
  'profile',
  'futures',
  'branch',
  'job',
  'feedback',
  'connections',
] as const;
export const admissionGated = (page: string) =>
  (GATED_PAGES as readonly string[]).includes(page);

// GET /me/consent answers the same status shape for an unadmitted account (the
// pre-admission route) and an admitted one. Anything else is not trusted.
export function admissionFromStatus(
  body: unknown,
  unreadable: string,
): AdmissionState {
  if (
    body !== null &&
    typeof body === 'object' &&
    (body as { schemaVersion?: unknown }).schemaVersion ===
      'privacy-consent-status-1' &&
    typeof (body as { acknowledged?: unknown }).acknowledged === 'boolean'
  )
    return (body as { acknowledged: boolean }).acknowledged
      ? { kind: 'admitted' }
      : { kind: 'consent' };
  return { kind: 'error', message: unreadable };
}

// An API error code decides the screen: capacity full shows the full page, a
// missing admission goes to the consent step, everything else is shown as is.
export function admissionFromError(
  code: string | null,
  message: string,
): AdmissionState {
  if (code === 'SERVICE_ADMISSION_CLOSED') return { kind: 'full' };
  if (code === 'SERVICE_ADMISSION_REQUIRED') return { kind: 'consent' };
  return { kind: 'error', message };
}

export const canSubmitConsent = (
  adult: boolean,
  accepted: boolean,
  busy: boolean,
) => adult && accepted && !busy;

// Children (the generation UI) render only for an admitted account.
export const showsContent = (state: AdmissionState) =>
  state.kind === 'admitted';

// A failed consent submit: capacity can run out between the status read and the
// submit (then the full page replaces the form); any other error stays on the
// form as a notice so the person can retry.
export function consentFailure(
  code: string | null,
  message: string,
): { kind: 'full' } | { kind: 'notice'; message: string } {
  return code === 'SERVICE_ADMISSION_CLOSED'
    ? { kind: 'full' }
    : { kind: 'notice', message };
}

import type { Locale } from './locales';
const errors: Record<string, readonly [string, string]> = {
  AUTH_REQUIRED: [
    'Please sign in to continue.',
    'Jelentkezz be a folytatáshoz.',
  ],
  AUTH_INVALID_TOKEN: ['Please sign in again.', 'Jelentkezz be újra.'],
  AUTH_REAUTH_REQUIRED: [
    'Sign in again within the last five minutes before downloading or deleting your data.',
    'Az adatletöltéshez és törléshez jelentkezz be újra az elmúlt 5 percen belül.',
  ],
  AUTH_NOT_CONFIGURED: [
    'Sign-in is not configured yet.',
    'A belépés még nincs beállítva.',
  ],
  PRIVACY_AUTH_DELETE_FAILED: [
    'Account deletion failed. Please try again later.',
    'A fiók törlése nem sikerült. Próbáld újra később.',
  ],
  ACCOUNT_DELETING: [
    'Your account is being deleted.',
    'A fiók törlése folyamatban van.',
  ],
  PRIVACY_ACKNOWLEDGEMENT_REQUIRED: [
    'Confirm that you are an adult and have read the AI privacy notice.',
    'A felnőttkor és az AI-adatkezelési tájékoztató elfogadása szükséges.',
  ],
  PROFILE_INCOMPLETE: [
    'Please answer all required profile questions.',
    'Válaszolj minden kötelező profilkérdésre.',
  ],
  PROFILE_UNKNOWN_QUESTION: [
    'The profile contains an unknown question.',
    'A profil ismeretlen kérdést tartalmaz.',
  ],
  PROFILE_REVISION_CONFLICT: [
    'Your profile has changed. Reload it before saving.',
    'A profil megváltozott. Mentés előtt töltsd újra.',
  ],
  RESOURCE_NOT_FOUND: [
    'The requested resource could not be found.',
    'A kért adat nem található.',
  ],
  IDEMPOTENCY_KEY_REQUIRED: [
    'A valid request identifier is required.',
    'Érvényes kérésazonosító szükséges.',
  ],
  IDEMPOTENCY_CONFLICT: [
    'This request identifier has already been used with different data.',
    'Ez a kérésazonosító már más adatokhoz tartozik.',
  ],
  GENERATION_LIMIT: [
    'You have reached the generation limit. Please try again later.',
    'Elérted a generálási korlátot. Próbáld meg később.',
  ],
  BRANCH_HORIZON_TOO_SHORT: [
    'There is not enough time left to generate a new branch here.',
    'Ezen a ponton túl kevés idő maradt új ág generálására.',
  ],
  JOB_LEASE_LOST: [
    'This generation task has moved to another worker. Check its status.',
    'A feladat másik workerhez került. Ellenőrizd a státuszát.',
  ],
  JOB_ATTEMPTS_EXHAUSTED: [
    'The background task was interrupted repeatedly.',
    'A háttérfeladat többször megszakadt.',
  ],
  AI_NOT_CONFIGURED: [
    'AI generation is not configured yet.',
    'Az AI-generálás még nincs beállítva.',
  ],
  AI_INCOMPLETE_OR_REFUSED: [
    'AI did not return a complete, acceptable result.',
    'Az AI nem készített teljes, elfogadható választ.',
  ],
  AI_INVALID_SCHEMA: [
    'The AI result did not match the required format.',
    'Az AI válasza nem felel meg az adatsémának.',
  ],
  AI_QUOTA_EXHAUSTED: [
    'AI generation is unavailable because the service budget has been exhausted.',
    'Az AI-generálás jelenleg nem elérhető: elfogyott a szolgáltatási keret.',
  ],
  AI_AUTH_FAILED: [
    'The AI service could not authenticate this request.',
    'Az AI-szolgáltató nem tudta hitelesíteni a kérést.',
  ],
  AI_RATE_LIMIT: [
    'The AI service is busy. Please try again later.',
    'Az AI-szolgáltató túlterhelt. Próbáld meg később.',
  ],
  AI_PROVIDER_FAILED: [
    'The AI service could not complete the request.',
    'Az AI-szolgáltató nem tudta teljesíteni a kérést.',
  ],
  AI_REQUEST_FAILED: [
    'The AI request could not be completed.',
    'Az AI-kérés nem sikerült.',
  ],
  STORY_FIDELITY_FAILED: [
    'The story check found a mismatch. Regeneration is required.',
    'A történet ellenőrzése eltérést talált. Újragenerálás szükséges.',
  ],
  VALIDATION_FAILED: [
    'Please check the information you entered.',
    'Ellenőrizd a megadott adatokat.',
  ],
  RATE_LIMIT: [
    'Too many requests. Please try again in one minute.',
    'Túl sok kérés. Próbáld meg egy perc múlva.',
  ],
  REQUEST_FAILED: [
    'The request could not be completed.',
    'A kérés nem sikerült.',
  ],
  INTERNAL_ERROR: [
    'The request could not be completed. Please try again later.',
    'A kérés nem sikerült. Próbáld meg később.',
  ],
  invalid_credentials: [
    'The email address or password is incorrect.',
    'Az e-mail-cím vagy a jelszó hibás.',
  ],
  email_not_confirmed: [
    'Confirm your email address before signing in.',
    'Belépés előtt erősítsd meg az e-mail-címedet.',
  ],
  user_already_exists: [
    'An account already exists for this email address.',
    'Ehhez az e-mail-címhez már tartozik fiók.',
  ],
  weak_password: [
    'Please choose a stronger password.',
    'Válassz erősebb jelszót.',
  ],
  over_request_rate_limit: [
    'Too many attempts. Please try again later.',
    'Túl sok próbálkozás. Próbáld meg később.',
  ],
};
const domainFailures: Record<string, readonly [string, string]> = {
  SIMULATION: [
    'The generated events did not pass consistency checks.',
    'A generált események nem feleltek meg a konzisztencia-ellenőrzésnek.',
  ],
  STORY: [
    'The story did not match the saved events or decisions.',
    'A történet nem illeszkedik a mentett eseményekhez vagy döntésekhez.',
  ],
  LIFE: [
    'The life state or proposed transition did not pass validation.',
    'Az életállapot vagy a javasolt átmenet nem felelt meg az ellenőrzésnek.',
  ],
};
function catalog(index: 0 | 1) {
  const localize = (source: Record<string, readonly [string, string]>) =>
    Object.fromEntries(
      Object.entries(source).map(([code, pair]) => [code, pair[index]]),
    );
  return { errors: localize(errors), domain: localize(domainFailures) };
}
const catalogs: Record<
  Locale,
  { errors: Record<string, string>; domain: Record<string, string> }
> = { en: catalog(0), hu: catalog(1) };
export function errorMessage(locale: Locale, code: string): string {
  const translation = catalogs[locale];
  const exact = Object.hasOwn(translation.errors, code)
    ? translation.errors[code]
    : undefined;
  const group = code.split('_')[0]!;
  const domain = Object.hasOwn(translation.domain, group)
    ? translation.domain[group]
    : undefined;
  return exact ?? domain ?? translation.errors.REQUEST_FAILED!;
}

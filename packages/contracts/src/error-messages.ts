import type { Locale } from './locales';
import { sharedErrorMessages } from './shared-context';
const errors: Record<string, readonly [string, string]> = {
  NARRATIVE_QUALITY_FAILED: [
    "We couldn't complete this chapter to the required quality. Your previous chapters and choices are saved.",
    'A fejezet nem érte el az elvárt minőséget. Korábbi fejezeteid és választásaid megmaradtak.',
  ],
  NARRATIVE_REQUEST_LIMIT: [
    'This attempt reached its generation limit. Your previous chapters and choices are saved.',
    'Ez a próbálkozás elérte a generálási korlátját. Korábbi fejezeteid és választásaid megmaradtak.',
  ],
  NARRATIVE_CONTEXT_INVALID: [
    "We couldn't verify this chapter's story context. Your previous chapters and choices are saved.",
    'A fejezet történeti előzményeit nem sikerült ellenőrizni. Korábbi fejezeteid és választásaid megmaradtak.',
  ],
  CLOSED_BETA_INVITE_REQUIRED: [
    'This closed beta is available to invited testers. You can still access and delete your existing data.',
    'This closed beta is available to invited testers. You can still access and delete your existing data.',
  ],
  PUBLIC_SCENARIO_CHANGED: [
    'The Scenario or its permissions changed. Review its current publication preview.',
    'The Scenario or its permissions changed. Review its current publication preview.',
  ],
  PUBLIC_SCENARIO_DISABLED: [
    'Public Scenario publication is currently unavailable.',
    'Public Scenario publication is currently unavailable.',
  ],
  PUBLIC_SCENARIO_PREVIEW_EXPIRED: [
    'This publication preview expired. Prepare a new preview before confirming.',
    'This publication preview expired. Prepare a new preview before confirming.',
  ],
  SCENARIO_PERSONALIZATION_LIMIT: [
    'Shorten the personal context so the complete starting setup fits.',
    'Shorten the personal context so the complete starting setup fits.',
  ],
  SCENARIO_PERSONALIZATION_CHANGED: [
    'Your details or the scenario changed. Review the new starting setup before creating a life.',
    'Your details or the scenario changed. Review the new starting setup before creating a life.',
  ],
  PUBLIC_FORK_START_CONFLICT: [
    'This story or its permission changed. Reload the decision points before starting your life.',
    'This story or its permission changed. Reload the decision points before starting your life.',
  ],
  PUBLIC_FORK_START_DISABLED: [
    'Starting a private life from this story is currently unavailable.',
    'Starting a private life from this story is currently unavailable.',
  ],
  PUBLIC_FORK_START_DELETED: [
    'The life created by this request was deleted. A new life requires a new explicit request.',
    'The life created by this request was deleted. A new life requires a new explicit request.',
  ],
  PUBLIC_CONTENT_CURATION_DISABLED: [
    'Complete curator submissions are currently disabled.',
    'A teljes kurátori beküldés jelenleg ki van kapcsolva.',
  ],
  PUBLIC_CONTENT_CURATION_AI_REQUIRED: [
    'A complete AI review with no findings is required before curator review.',
    'A kurátori vizsgálat előtt találatmentes teljes AI-ellenőrzés szükséges.',
  ],
  PUBLIC_CONTENT_CURATION_INVALID: [
    'The curator review does not match this saved copy. Reload its status.',
    'A kurátori vizsgálat nem ehhez a mentett másolathoz tartozik. Töltsd újra az állapotát.',
  ],
  PUBLIC_CONTENT_CURATION_DECIDED: [
    'This complete curator decision is final. Prepare a revised copy for another review.',
    'Ez a teljes kurátori döntés végleges. Új vizsgálathoz készíts módosított másolatot.',
  ],
  PUBLIC_CONTENT_REVIEW_DISABLED: [
    'Paid complete content reviews are currently disabled.',
    'A fizetős teljes tartalomvizsgálat jelenleg ki van kapcsolva.',
  ],
  PUBLIC_CONTENT_REVIEW_INVALID: [
    'The complete review does not match this saved copy. Reload its status.',
    'A teljes vizsgálat nem ehhez a mentett másolathoz tartozik. Töltsd újra az állapotát.',
  ],
  PUBLIC_CONTENT_REVIEW_LIMIT: [
    'The complete copy is too large for an AI review. Prepare a shorter copy.',
    'A teljes másolat túl nagy az AI-vizsgálathoz. Készíts rövidebb másolatot.',
  ],
  PUBLIC_CONTENT_DISABLED: [
    'Full content preparation is currently unavailable.',
    'A teljes tartalom előkészítése jelenleg nem elérhető.',
  ],
  PUBLIC_CONTENT_INVALID: [
    'This content bundle could not be verified.',
    'A tartalomcsomag nem ellenőrizhető.',
  ],
  PUBLIC_CONTENT_PRIVACY: [
    'Generalize identifying details before preparing this content.',
    'Általánosítsd az azonosító részleteket a tartalom előkészítése előtt.',
  ],
  PUBLIC_CONTENT_SOURCE: [
    'Reload the saved preview before preparing this content.',
    'Töltsd újra a mentett előnézetet a tartalom előkészítése előtt.',
  ],
  PUBLIC_CONTENT_LIMIT: [
    'This content exceeds the preparation limit.',
    'A tartalom meghaladja az előkészítési korlátot.',
  ],
  PUBLIC_FORK_DISABLED: [
    'Decision checkpoint preparation is currently unavailable.',
    'A döntési checkpoint előkészítése jelenleg nem elérhető.',
  ],
  PUBLIC_FORK_INVALID: [
    'This decision checkpoint could not be verified.',
    'A döntési checkpoint nem ellenőrizhető.',
  ],
  PUBLIC_FORK_PRIVACY: [
    'Generalize identifying details in the decision checkpoint.',
    'Általánosítsd az azonosító részleteket a döntési checkpointban.',
  ],
  PUBLIC_FORK_REFERENCE: [
    'The decision checkpoint contains inconsistent references.',
    'A döntési checkpoint hivatkozásai nem konzisztensek.',
  ],
  PUBLIC_FORK_SOURCE: [
    'Reload the saved preview before preparing a decision checkpoint.',
    'A döntési checkpoint előtt töltsd újra a mentett előnézetet.',
  ],
  PUBLIC_FORK_SEMANTICS: [
    'Generalization changed the decision facts, effects or displayed options.',
    'Az általánosítás módosította a döntés tényeit, hatásait vagy megjelenített opcióit.',
  ],
  PUBLIC_FORK_LIMIT: [
    'You have reached the checkpoint limit for this copy.',
    'Elérted a másolat checkpointkorlátját.',
  ],
  SCENARIO_DISABLED: [
    'Scenario preparation is currently unavailable.',
    'A szcenárió-előkészítés jelenleg nem elérhető.',
  ],
  SCENARIO_PRIVACY_PREFLIGHT: [
    'Remove contact details and internal references from the template.',
    'Távolítsd el az elérhetőségeket és belső hivatkozásokat a sablonból.',
  ],
  SCENARIO_REFERENCE: [
    'The template contains inconsistent goals or placeholder references.',
    'A sablon céljai vagy helyettesítő hivatkozásai nem konzisztensek.',
  ],
  SCENARIO_INTERVAL: [
    'Check the starting date and opportunity expiry dates.',
    'Ellenőrizd a kezdőnapot és a lehetőségek lejáratát.',
  ],
  SCENARIO_REVISION_CONFLICT: [
    'Reload the current scenario before continuing.',
    'A folytatás előtt töltsd újra az aktuális szcenáriót.',
  ],
  SCENARIO_INVALID: [
    'This template could not be verified.',
    'A sablon nem ellenőrizhető.',
  ],
  SCENARIO_TOO_LARGE: [
    'Shorten this scenario template.',
    'Rövidítsd le a szcenáriósablont.',
  ],
  SCENARIO_LIMIT: [
    'You have reached the scenario or version limit.',
    'Elérted a szcenáriók vagy verziók korlátját.',
  ],
  SHARED_PRIVACY_CHANGED: [
    'Shared details changed for privacy. Retry with refreshed history.',
    'A közös részletek adatvédelmi okból változtak. Próbáld újra friss előzménnyel.',
  ],
  SHARED_MODERATION_HOLD: [
    'This group is paused for a safety review. Your personal story can continue.',
    'A csoport biztonsági ellenőrzés miatt zárolva. A saját történeted folytatható.',
  ],
  SHARED_REPORT_LIMIT: [
    'You have reached the report limit. Please try again tomorrow.',
    'Elérted a jelentési korlátot. Próbáld újra holnap.',
  ],
  FEEDBACK_LIMIT: [
    'You have reached the feedback limit. Please try again tomorrow.',
    'Elérted a visszajelzési korlátot. Próbáld újra holnap.',
  ],
  PUBLIC_PREVIEW_INVALID: [
    'The preview does not match this life.',
    'Az előnézet nem egyezik ezzel az élettel.',
  ],
  PUBLIC_PREVIEW_PERIOD_LIMIT: [
    'Copy previews currently support lives with 1–12 completed periods.',
    'Az előnézet jelenleg 1–12 befejezett időszakot tartalmazó életből készülhet.',
  ],
  PUBLIC_REVIEW_TOO_LARGE: [
    'This copy is too long for a complete AI review. Shorten it before saving a new preview.',
    'A másolat túl hosszú a teljes AI-ellenőrzéshez. Új előnézet előtt rövidítsd le.',
  ],
  PUBLIC_REVIEW_INVALID: [
    'This AI review could not be verified. Keep the copy private and prepare a new preview.',
    'Az AI-ellenőrzés nem igazolható. A másolat maradjon privát; készíts új előnézetet.',
  ],
  PUBLIC_REVIEW_ALREADY_STARTED: [
    'This preview already has an AI review attempt. Prepare a new preview after a failed check.',
    'Ehhez az előnézethez már indult AI-ellenőrzés. Sikertelen próba után készíts új előnézetet.',
  ],
  PUBLIC_REVIEW_DISABLED: [
    'Paid AI reviews are currently unavailable. This copy remains private.',
    'Az AI-ellenőrzés jelenleg nem elérhető. A másolat privát marad.',
  ],
  PUBLIC_CURATION_DISABLED: [
    'Copy text reviews are currently unavailable. Your copy remains private.',
    'A másolat szövegellenőrzése jelenleg nem elérhető.',
  ],
  PUBLIC_CURATION_AI_REQUIRED: [
    'Complete the AI review and resolve its findings before requesting a copy text review.',
    'Előbb sikeres, jelzés nélküli AI-ellenőrzés szükséges.',
  ],
  PUBLIC_CURATION_INVALID: [
    'This text review does not match the saved copy. Prepare a new preview.',
    'A szövegellenőrzés nem egyezik a mentett másolattal.',
  ],
  PUBLIC_CURATION_DECIDED: [
    'This copy already has a text review decision. Prepare a new preview for changes.',
    'A másolat szövegellenőrzési döntése már végleges.',
  ],
  PUBLIC_REVIEW_LIMIT: [
    'You have reached the review limit, or another review is still pending. Refresh its status before starting a new one.',
    'Elérted az ellenőrzési limitet, vagy még egy ellenőrzés folyamatban van.',
  ],
  PUBLIC_PRIVACY_REVIEW_REQUIRED: [
    'Remove personal details before preparing the preview.',
    'Az előnézet előtt távolítsd el a személyes részleteket.',
  ],
  PUBLIC_SHARED_REVIEW_REQUIRED: [
    'This life includes shared history. A separate privacy review is required before preparing a public copy.',
    'Ez az élet közös előzményt tartalmaz. Nyilvános másolat előtt külön adatvédelmi ellenőrzés szükséges.',
  ],
  PUBLIC_PREVIEW_UNAVAILABLE: [
    'Finish this period before preparing a preview.',
    'Az előnézet előtt fejezd be az időszakot.',
  ],
  PUBLIC_PREVIEW_EXPIRED: [
    'This preview expired. Prepare a new one.',
    'Az előnézet lejárt. Készíts újat.',
  ],
  SMOKE_BUDGET_EXCEEDED: [
    'The development AI allowance is exhausted. Your story is saved.',
    'A fejlesztői AI-keret elfogyott. A történeted mentve van.',
  ],
  SMOKE_RUN_ACTIVE: [
    'Another paid development test is running. Please retry later.',
    'Másik fizetett fejlesztői próba fut. Próbáld újra később.',
  ],
  AUTH_ADMIN_NOT_CONFIGURED: [
    'Account deletion needs the server administrator key. Your account is unchanged.',
    'A fióktörléshez szükséges a szerver adminisztrátori kulcsa. A fiókod változatlan.',
  ],
  PRIVACY_AUTH_CHECK_FAILED: [
    'Account deletion is waiting for a server check.',
    'A fióktörlés szerveroldali ellenőrzésre vár.',
  ],
  LIFE_REVISION_CONFLICT: [
    'This life or draft changed. Reload before continuing.',
    'Az élet vagy piszkozat megváltozott. Folytatás előtt töltsd újra.',
  ],
  LIFE_PENDING_DECISION: [
    'Choose an option before continuing this life.',
    'Válassz a döntési lehetőségek közül a folytatás előtt.',
  ],
  LIFE_GENERATION_ACTIVE: [
    'This life already has an active generation task.',
    'Ehhez az élethez már fut generálás.',
  ],
  LIFE_RETRY_UNAVAILABLE: [
    'This task cannot be retried. Reload its latest status.',
    'Ez a feladat nem próbálható újra. Töltsd újra a státuszát.',
  ],
  LIFE_REPAIR_EXHAUSTED: [
    'Automatic repair stopped. Your existing story is saved.',
    'Az automatikus javítás megállt. A meglévő történeted mentve van.',
  ],
  LIFE_CHAPTER_INVALID: [
    'The chapter failed its length or canon checks.',
    'A fejezet nem felelt meg a hossz vagy canon ellenőrzésnek.',
  ],
  AI_BUDGET_CONFIG: [
    'The AI budget needs server configuration.',
    'Az AI-keret szerveroldali beállítása szükséges.',
  ],
  AI_BUDGET_EXCEEDED: [
    'The AI budget is exhausted. Your saved story remains available.',
    'Az AI-keret elfogyott. A mentett történeted továbbra is elérhető.',
  ],
  AI_BUDGET_WINDOW_CLOSED: [
    'AI generation is paused outside the approved spending period. Your saved story remains available.',
    'AI generation is paused outside the approved spending period. Your saved story remains available.',
  ],
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
    'Account deletion could not be confirmed. Your account remains paused while the deletion is completed. Contact info@alterward.com if you need help.',
    'A fióktörlés még nem igazolható. A fiókod a törlés befejezéséig zárolva marad. Segítség: info@alterward.com.',
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
  DISCOVERY_DISABLED: [
    'Discovery is not available yet.',
    'A történetek böngészése még nem érhető el.',
  ],
  SAVED_LIVES_DISABLED: [
    'Saved lives are not available yet.',
    'A történetek mentése még nem érhető el.',
  ],
  SAVED_LIVES_LIMIT: [
    'You can save up to 500 lives. Remove a save before adding another.',
    'Legfeljebb 500 történetet menthetsz. Törölj egy mentést az újhoz.',
  ],
  PUBLIC_REPORTS_DISABLED: [
    'Public reports are not available yet.',
    'A nyilvános bejelentés még nem érhető el.',
  ],
  PUBLIC_METRICS_DISABLED: [
    'Reading measurements are unavailable.',
    'Az olvasásmérés nem érhető el.',
  ],
  PUBLIC_COLLECTIONS_DISABLED: [
    'Collections are not open yet.',
    'A gyűjtemények még nem nyíltak meg.',
  ],
  PUBLIC_COLLECTION_CONFLICT: [
    'The collection or publication changed. Reload before applying.',
    'A gyűjtemény vagy publikáció megváltozott. Töltsd újra.',
  ],
  PUBLIC_COLLECTION_INELIGIBLE: [
    'This life does not fit this collection.',
    'Ez az élet nem illik ebbe a gyűjteménybe.',
  ],
  PUBLIC_METRICS_LIMIT: [
    'Reading measurement limit reached.',
    'Elértük az olvasásmérés korlátját.',
  ],
  PUBLIC_READING_TOO_EARLY: [
    'Reading end is not yet measurable.',
    'Az olvasás vége még nem mérhető.',
  ],
  PUBLIC_REPORT_LIMIT: [
    'You can submit up to ten new reports in 24 hours.',
    '24 óránként legfeljebb tíz új bejelentést küldhetsz.',
  ],
  PUBLIC_MODERATION_CONFLICT: [
    'This moderation decision changed. Reload the queue.',
    'A moderációs döntés megváltozott. Töltsd újra a sort.',
  ],
  PUBLICATION_RESTRICTED: [
    'Publishing is restricted for your account. Check your safety notices in Settings.',
    'A fiókod publikálása korlátozott. A figyelmeztetések a beállításokban láthatók.',
  ],
  INTERNAL_ERROR: [
    'The request could not be completed. Please try again later.',
    'A kérés nem sikerült. Próbáld meg később.',
  ],
  invalid_credentials: [
    'The email address or password is incorrect.',
    'Az e-mail-cím vagy a jelszó hibás.',
  ],
  otp_expired: [
    'That sign-in link is invalid, expired, or has already been used. Request a new link, or sign in with your password.',
    'A belépési link érvénytelen, lejárt vagy már felhasználták. Kérj új linket, vagy jelentkezz be a jelszavaddal.',
  ],
  AUTH_CALLBACK_FAILED: [
    'That sign-in link could not be used. Request a new link, or sign in with your password.',
    'Ez a belépési link nem használható. Kérj új linket, vagy jelentkezz be a jelszavaddal.',
  ],
  same_password: [
    'Choose a different password. This is already your current password.',
    'Válassz másik jelszót. Ez már a jelenlegi jelszavad.',
  ],
  signup_disabled: [
    'Registration is by invitation only. Contact info@alterward.com for help.',
    'Regisztrálni csak meghívással lehet. Segítség: info@alterward.com.',
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
Object.assign(errors, sharedErrorMessages);
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

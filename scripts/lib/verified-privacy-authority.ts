// Operator entry point. Its snapshot reader is module-private so an issued Auth
// proof cannot be paired with a different application transaction.
// A physical root writer fence is still required before production recovery.
export { captureVerifiedPrivacyRestoreAuthority } from './privacy-restore';

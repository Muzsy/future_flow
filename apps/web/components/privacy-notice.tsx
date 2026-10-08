import { en } from '../lib/i18n/messages';
export function PrivacyNotice() {
  return (
    <>
      <h1>{en['privacy.title']}</h1>
      <p>{en['privacy.introduction']}</p>
      <p>{en['privacy.operator']}</p>
      <p>
        Contact: <a href="mailto:info@alterward.com">info@alterward.com</a>
      </p>
      <h2>{en['privacy.aiTitle']}</h2>
      <p>{en['privacy.aiDescription']}</p>
      <h2>{en['privacy.scenarioTitle']}</h2>
      <p>{en['privacy.scenarioDescription']}</p>
      <h2>Private-beta access</h2>
      <p>
        Cloudflare verifies approved email addresses to protect the private
        beta. It processes login and access information, including your email
        address, network address and request metadata. Access approval does not
        replace your alterward account.
      </p>
      <h2>{en['privacy.dataTitle']}</h2>
      <p>{en['privacy.dataDescription']}</p>
      <p>
        Minimal activity records contain account, life, chapter and session
        identifiers, event types and server timestamps, without your story or
        profile. Private feedback is included in your export and removed from
        the application database when you delete your account.
      </p>
      <p>
        <a href="/account-access">Download or delete your own account data</a>,
        even after private-beta access ends.
      </p>
      <p className="notice">{en['privacy.alphaNotice']}</p>
    </>
  );
}

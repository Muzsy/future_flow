'use client';
import { LegalDraftNotice, LegalSection, LegalText } from './legal-text';
import { useLanguage } from './language-provider';

export function PrivacyNotice() {
  const { t } = useLanguage();
  return (
    <>
      <h1>{t('privacy.title')}</h1>
      <LegalDraftNotice />
      <p>{t('privacy.introduction')}</p>
      <LegalSection title="privacy.operatorTitle">
        <p>{t('privacy.operator')}</p>
        <p>
          <LegalText text={t('legal.operatorPlaceholder')} />
        </p>
        <p>
          {t('privacy.contact')}{' '}
          <a href="mailto:info@alterward.com">info@alterward.com</a>
        </p>
      </LegalSection>
      <LegalSection
        title="privacy.collectTitle"
        list={[
          'privacy.collect1',
          'privacy.collect2',
          'privacy.collect3',
          'privacy.collect4',
          'privacy.collect5',
          'privacy.collect6',
        ]}
      />
      <LegalSection
        title="privacy.purposesTitle"
        paragraphs={['privacy.purposesNote']}
        list={[
          'privacy.purpose1',
          'privacy.purpose2',
          'privacy.purpose3',
          'privacy.purpose4',
        ]}
      />
      <LegalSection
        title="privacy.aiTitle"
        paragraphs={['privacy.aiDescription']}
      />
      <LegalSection
        title="privacy.scenarioTitle"
        paragraphs={['privacy.scenarioDescription']}
      />
      <LegalSection
        title="privacy.processorsTitle"
        paragraphs={['privacy.processorsNote']}
        list={[
          'privacy.processor1',
          'privacy.processor2',
          'privacy.processor3',
          'privacy.processor4',
          'privacy.processor5',
        ]}
      />
      <LegalSection
        title="privacy.transfersTitle"
        paragraphs={['privacy.transfers']}
      />
      <LegalSection
        title="privacy.retentionTitle"
        list={[
          'privacy.retention1',
          'privacy.retention2',
          'privacy.retention3',
          'privacy.retention4',
          'privacy.retention5',
        ]}
      />
      <LegalSection
        title="privacy.rightsTitle"
        paragraphs={['privacy.rights1', 'privacy.rights2', 'privacy.rights3']}
      />
      <LegalSection title="privacy.dataTitle">
        <p>{t('privacy.dataDescription')}</p>
        <p>{t('privacy.activity')}</p>
        <p>
          <a href="/account-access">{t('privacy.accountLink')}</a>
          {t('privacy.accountLinkSuffix')}
        </p>
      </LegalSection>
      <LegalSection
        title="privacy.cookiesTitle"
        paragraphs={['privacy.cookies']}
      />
      <LegalSection
        title="privacy.automatedTitle"
        paragraphs={['privacy.automated']}
      />
      <LegalSection
        title="privacy.betaAccessTitle"
        paragraphs={['privacy.betaAccess']}
      />
      <p>
        <a href="/terms">{t('legal.termsLink')}</a>
      </p>
    </>
  );
}

'use client';
import { LegalDraftNotice, LegalSection, LegalText } from './legal-text';
import { useLanguage } from './language-provider';

export function TermsOfUse() {
  const { t } = useLanguage();
  return (
    <>
      <h1>{t('terms.title')}</h1>
      <LegalDraftNotice />
      <LegalSection title="terms.operatorTitle">
        <p>{t('privacy.operator')}</p>
        <p>
          <LegalText text={t('legal.operatorDetails')} />
        </p>
        <p>
          {t('privacy.contact')}{' '}
          <a href="mailto:info@alterward.com">info@alterward.com</a>
        </p>
      </LegalSection>
      <LegalSection
        title="terms.serviceTitle"
        paragraphs={['terms.service1', 'terms.service2']}
      />
      <LegalSection
        title="terms.accountTitle"
        paragraphs={['terms.account1', 'terms.account2', 'terms.account3']}
      >
        <p>
          <a href="/account-access">{t('privacy.accountLink')}</a>
        </p>
      </LegalSection>
      <LegalSection
        title="terms.inputTitle"
        paragraphs={['terms.input1', 'terms.input2']}
      >
        <p>
          <a href="/privacy-notice">{t('legal.privacyLink')}</a>
        </p>
      </LegalSection>
      <LegalSection
        title="terms.contentTitle"
        paragraphs={['terms.content1', 'terms.content2']}
      />
      <LegalSection
        title="terms.useTitle"
        paragraphs={['terms.use1', 'terms.use2']}
      />
      <LegalSection
        title="terms.limitsTitle"
        paragraphs={['terms.limits1', 'terms.limits2']}
      />
      <LegalSection
        title="terms.paymentTitle"
        paragraphs={['terms.payment1', 'terms.payment2', 'terms.payment3']}
      />
      <LegalSection
        title="terms.endTitle"
        paragraphs={['terms.end1', 'terms.end2']}
      />
      <LegalSection
        title="terms.liabilityTitle"
        paragraphs={['terms.liability1']}
      />
      <LegalSection
        title="terms.changesTitle"
        paragraphs={['terms.changes1', 'terms.changes2']}
      />
    </>
  );
}

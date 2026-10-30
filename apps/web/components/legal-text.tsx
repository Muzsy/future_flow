'use client';
import type { ReactNode } from 'react';
import { useLanguage } from './language-provider';
import type { MessageKey } from '../lib/i18n';

// Undecided or unverified items are written in [square brackets] in the catalog.
// They are highlighted so a draft text cannot be mistaken for a final one.
export function LegalText({ text }: { text: string }) {
  return text.split(/(\[[^\]]+\])/).map((part, index) =>
    part.startsWith('[') ? (
      <mark className="legal-placeholder" key={index}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function LegalDraftNotice() {
  const { t } = useLanguage();
  return (
    <p className="notice" role="note">
      {t('legal.draftNotice')}
    </p>
  );
}

export function LegalSection({
  title,
  paragraphs,
  list,
  children,
}: {
  title: MessageKey;
  paragraphs?: MessageKey[];
  list?: MessageKey[];
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <>
      <h2>{t(title)}</h2>
      {paragraphs?.map((key) => (
        <p key={key}>
          <LegalText text={t(key)} />
        </p>
      ))}
      {list && (
        <ul>
          {list.map((key) => (
            <li key={key}>
              <LegalText text={t(key)} />
            </li>
          ))}
        </ul>
      )}
      {children}
    </>
  );
}

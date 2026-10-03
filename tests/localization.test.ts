import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  DEFAULT_LOCALE,
  supportedLocales,
  languages,
  resolveLocale,
  localeFromAcceptLanguage,
  getQuestionnaire,
  questionnaire,
  futureRequestSchema,
  errorMessage,
} from '@future-flow/contracts';
import { messages, translate, formatDate } from '../apps/web/lib/i18n';

describe('language contracts', () => {
  it('defaults to English, enables only complete languages and respects explicit preferences', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(supportedLocales).toEqual(['en', 'hu']);
    expect(Object.keys(languages)).toEqual([...supportedLocales]);
    expect(resolveLocale('hu-HU')).toBe('hu');
    expect(resolveLocale('de')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
    expect(localeFromAcceptLanguage('de;q=1,hu-HU;q=0.8,en;q=0.3')).toBe('hu');
    expect(localeFromAcceptLanguage('hu;q=0,en;q=0.3')).toBe('en');
    expect(localeFromAcceptLanguage('hu;q=invalid')).toBe('en');
    expect(
      futureRequestSchema.parse({
        profileVersionId: 'b3a09ae6-7325-440b-864f-f15db1cfbe0f',
        horizonYears: 10,
        mode: 'baseline',
      }).locale,
    ).toBe('en');
  });
  it('provides complete catalogs with equivalent interpolation parameters', () => {
    const keys = Object.keys(messages.en) as (keyof typeof messages.en)[];
    expect(Object.keys(messages.hu).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      const parameters = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(parameters(messages.hu[key]), key).toEqual(
        parameters(messages.en[key]),
      );
      expect(messages.en[key].trim(), key).not.toBe('');
      expect(messages.hu[key].trim(), key).not.toBe('');
    }
    expect(translate('en', 'story.chapter', { number: 2 })).toBe('Chapter 2');
    expect(translate('hu', 'story.chapter', { number: 2 })).toBe('2. fejezet');
    expect(() => translate('en', 'story.chapter')).toThrow(
      'Missing translation parameter',
    );
    expect(formatDate('2026-10-03', 'en')).toContain('Oct');
    expect(formatDate('2026-10-03', 'hu')).toContain('okt');
  });
  it('translates every question without changing canonical profile fields, values or scoring', () => {
    const english = getQuestionnaire('en');
    expect(getQuestionnaire('hu')).toBe(questionnaire);
    expect(english.version).toBe(questionnaire.version);
    expect(english.scoringVersion).toBe(questionnaire.scoringVersion);
    const shape = (definition: typeof english) =>
      definition.questions.map(
        ({
          label: _label,
          help: _help,
          section: _section,
          options,
          ...question
        }) => ({
          ...question,
          ...(options ? { options: options.map(({ value }) => value) } : {}),
        }),
      );
    expect(shape(english)).toEqual(shape(questionnaire));
    for (let index = 0; index < english.questions.length; index++) {
      const question = english.questions[index]!;
      expect(question.label).not.toBe(questionnaire.questions[index]!.label);
      expect(question.section).not.toMatch(/[áéíóöőúüű]/i);
    }
    expect(errorMessage('en', 'AI_QUOTA_EXHAUSTED')).not.toMatch(
      /[áéíóöőúüű]/i,
    );
    expect(errorMessage('en', 'toString')).toBe(
      errorMessage('en', 'REQUEST_FAILED'),
    );
  });
  it('labels existing lives Hungarian without touching content and defaults future inserts to English', async () => {
    const engine = new PGlite();
    try {
      await engine.exec(
        'CREATE TABLE ff_futures(id int PRIMARY KEY, canon jsonb); INSERT INTO ff_futures VALUES(1,\'{"title":"Magyar történet"}\');',
      );
      await engine.exec(
        readFileSync('database/migrations/002_content_locale.sql', 'utf8'),
      );
      await engine.exec('INSERT INTO ff_futures(id) VALUES(2)');
      const rows = (await engine.query('SELECT * FROM ff_futures ORDER BY id'))
        .rows;
      expect(rows).toEqual([
        { id: 1, canon: { title: 'Magyar történet' }, content_locale: 'hu' },
        { id: 2, canon: null, content_locale: 'en' },
      ]);
      await expect(
        engine.exec("UPDATE ff_futures SET content_locale='en' WHERE id=1"),
      ).rejects.toThrow('immutable');
    } finally {
      await engine.close();
    }
  });
});

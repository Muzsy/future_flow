import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hash, prepareScenarioPersonalization } from '@future-flow/core';
import { scenarioFixture } from './scenario-fixtures';
import { personalScenarioFixture } from './scenario-personalization-fixtures';
import {
  verifiedScenarioReader,
  verifiedScenarioSource,
  verifiedScenarioPublicationPreview,
  verifiedPersonalScenarioPreview,
} from '../apps/web/lib/scenario-ui';
function fixture() {
  const template = scenarioFixture(),
    templateHash = hash(template),
    slug = 'scenario-' + 'a'.repeat(32),
    versionId = randomUUID();
  const source = {
    schemaVersion: 'scenario-ui-1' as const,
    scenarioVersionId: versionId,
    templateHash,
    sourceGrantId: randomUUID(),
    template,
    publicationApproved: false as const,
    officialLifeApproved: false as const,
  };
  const reader = {
    schemaVersion: 'public-scenario-1' as const,
    slug,
    templateHash,
    template,
    allowPersonalization: true,
    officialScenario: true as const,
    officialLifeApproved: false as const,
    publishedAt: '2026-10-07T00:00:00Z',
  };
  const publicationBody = {
    schemaVersion: 'public-scenario-1' as const,
    id: randomUUID(),
    scenarioVersionId: versionId,
    sourceGrantId: source.sourceGrantId,
    templateHash,
    template,
    allowPersonalization: true,
    expiresAt: '2026-10-07T12:00:00Z',
    publicationApproved: false as const,
    officialLifeApproved: false as const,
  };
  const publication = {
    ...publicationBody,
    previewHash: hash(publicationBody),
  };
  const profile = personalScenarioFixture(),
    composition = prepareScenarioPersonalization(template, profile),
    personalBody = {
      schemaVersion: 'personal-scenario-1' as const,
      id: randomUUID(),
      sourceSlug: slug,
      templateHash,
      profileHash: hash(profile),
      profile,
      expiresAt: '2026-10-07T12:00:00Z',
      composition,
      publicationApproved: false as const,
      officialLifeApproved: false as const,
    };
  return {
    source,
    reader,
    publication,
    profile,
    personal: { ...personalBody, previewHash: hash(personalBody) },
  };
}
describe('complete English Scenario UI binding', () => {
  it('verifies exact public template, private source, permission preview and full own starting composition with browser-compatible hashes', async () => {
    const f = fixture();
    expect(await verifiedScenarioReader(f.reader, f.reader.slug)).toEqual(
      f.reader,
    );
    expect(
      await verifiedScenarioSource(f.source, f.source.scenarioVersionId),
    ).toEqual(f.source);
    expect(
      await verifiedScenarioPublicationPreview(f.publication, f.source, true),
    ).toEqual(f.publication);
    expect(
      await verifiedPersonalScenarioPreview(f.personal, f.reader, f.profile),
    ).toEqual(f.personal);
  });
  it('refuses a different reader, old source version and unbound public template even when their shape is valid', async () => {
    const f = fixture();
    await expect(
      verifiedScenarioReader(f.reader, 'scenario-' + 'b'.repeat(32)),
    ).rejects.toThrow();
    await expect(
      verifiedScenarioSource(f.source, randomUUID()),
    ).rejects.toThrow();
    await expect(
      verifiedScenarioReader(
        {
          ...f.reader,
          template: { ...f.reader.template, title: 'Changed example' },
        },
        f.reader.slug,
      ),
    ).rejects.toThrow();
  });
  it('requires the selected personalization permission and full prepared public copy without extra authority', async () => {
    const f = fixture();
    await expect(
      verifiedScenarioPublicationPreview(f.publication, f.source, false),
    ).rejects.toThrow();
    await expect(
      verifiedScenarioPublicationPreview(
        { ...f.publication, officialLifeApproved: true },
        f.source,
        true,
      ),
    ).rejects.toThrow();
    await expect(
      verifiedScenarioPublicationPreview(
        { ...f.publication, sourceGrantId: randomUUID() },
        f.source,
        true,
      ),
    ).rejects.toThrow();
  });
  it('invalidates personal approval when any complete starting fact changes', async () => {
    const f = fixture(),
      profile = {
        ...f.profile,
        startingState: {
          ...f.profile.startingState,
          finance: { ...f.profile.startingState.finance, liquidFunds: 700 },
        },
      };
    await expect(
      verifiedPersonalScenarioPreview(f.personal, f.reader, profile),
    ).rejects.toThrow();
    await expect(
      verifiedPersonalScenarioPreview(
        { ...f.personal, sourceSlug: 'scenario-' + 'b'.repeat(32) },
        f.reader,
        f.profile,
      ),
    ).rejects.toThrow();
  });
  it('checks the nested composition as well as its outer binding and rejects changed private/public authority', async () => {
    const f = fixture(),
      changed = {
        ...f.personal,
        composition: {
          ...f.personal.composition,
          facts: {
            ...f.personal.composition.facts,
            startingState: {
              ...f.personal.composition.facts.startingState,
              skills: ['Unapproved skill'],
            },
          },
        },
      };
    const { previewHash: _hash, ...body } = changed;
    await expect(
      verifiedPersonalScenarioPreview(
        { ...changed, previewHash: hash(body) },
        f.reader,
        f.profile,
      ),
    ).rejects.toThrow();
    await expect(
      verifiedPersonalScenarioPreview(
        { ...f.personal, publicationApproved: true },
        f.reader,
        f.profile,
      ),
    ).rejects.toThrow();
  });
});

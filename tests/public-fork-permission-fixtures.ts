// Reviewed checkpoint fixtures only. Simulated provider receipts are not seed content.
import { randomUUID } from 'node:crypto';
import {
  PublicationRepository,
  OfficialPublicationRepository,
  type Database,
  type PublicationConfig,
} from '@future-flow/database';
import {
  publicationFixture,
  approvePublicationFixture,
} from './publication-fixtures';
import {
  officialLifeFixture,
  processOfficialFixture,
  officialBundleFixture,
  officialGrant,
} from './official-life-fixtures';
export async function communityForkCopy(
  db: Database,
  config: PublicationConfig,
  owner?: string,
) {
  const f = await publicationFixture(db, owner),
    input = await approvePublicationFixture(db, f);
  if (!input) throw Error('Technical approval missing');
  input.settings.visibility = 'public';
  const pubs = new PublicationRepository(db, config),
    preview = await pubs.prepare(f.owner, input, randomUUID()),
    view = await pubs.confirm(
      f.owner,
      {
        previewId: preview.previewId,
        previewHash: preview.previewHash,
        acknowledged: true,
      },
      randomUUID(),
    );
  return { ...f, pubs, view };
}
export async function officialForkCopy(
  db: Database,
  config: PublicationConfig,
  owner?: string,
) {
  const f = await officialLifeFixture(db, owner),
    created = await f.official.start(f.owner, f.startRequest, randomUUID());
  await processOfficialFixture(db, f.owner, created.jobId);
  const copy = await officialBundleFixture(
      db,
      f,
      created,
      true,
      undefined,
      true,
    ),
    source = await f.official.inspect(f.owner, copy.bundle.bundleId),
    grant = await f.official.grant(f.owner, officialGrant(source)),
    pubs = new OfficialPublicationRepository(db, config),
    preview = await pubs.prepare(
      f.owner,
      {
        binding: {
          ...source.evidence.binding,
          sourceVersion: 'official-life-source-1',
          grantId: grant.grant!.id,
          evidenceHash: source.evidenceHash,
        },
        settings: {
          visibility: 'public',
          authorMode: 'anonymous',
          indexable: false,
        },
      },
      randomUUID(),
    ),
    view = await pubs.confirm(
      f.owner,
      {
        previewId: preview.previewId,
        previewHash: preview.previewHash,
        acknowledged: true,
      },
      randomUUID(),
    );
  return { ...f, created, copy, grant, pubs, view };
}

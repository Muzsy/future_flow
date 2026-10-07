// Technical fixture: edited reviewed copies, no actual provider call or genuine seed publication.
import { randomUUID } from 'node:crypto';
import {
  PublicContentRepository,
  OfficialPublicationRepository,
  type PublicationConfig,
  type Database,
} from '@future-flow/database';
import {
  officialLifeFixture,
  processOfficialFixture,
  officialBundleFixture,
  officialGrant,
} from './official-life-fixtures';
export async function officialRefreshFixture(
  db: Database,
  config: PublicationConfig,
) {
  const f = await officialLifeFixture(db),
    created = await f.official.start(f.owner, f.startRequest, randomUUID());
  await processOfficialFixture(db, f.owner, created.jobId);
  const pubs = new OfficialPublicationRepository(db, config, {
    enabled: false,
  });
  async function prepare(editedTitle?: string) {
    const copy = await officialBundleFixture(db, f, created, true, editedTitle),
      inspected = await f.official.inspect(f.owner, copy.bundle.bundleId),
      grant = await f.official.grant(f.owner, officialGrant(inspected)),
      preview = await pubs.prepare(
        f.owner,
        {
          binding: {
            ...inspected.evidence.binding,
            sourceVersion: 'official-life-source-1',
            grantId: grant.grant!.id,
            evidenceHash: inspected.evidenceHash,
          },
          settings: {
            visibility: 'public',
            authorMode: 'anonymous',
            indexable: false,
          },
        },
        randomUUID(),
      );
    return { copy, grant, preview };
  }
  const first = await prepare(),
    previous = await pubs.confirm(
      f.owner,
      {
        previewId: first.preview.previewId,
        previewHash: first.preview.previewHash,
        acknowledged: true,
      },
      randomUUID(),
    ),
    next = await prepare('A fully reviewed revised Official title');
  return { f, pubs, previous, next, preview: next.preview };
}
import {
  approvePublicationFixture,
  publicationFixture,
} from './publication-fixtures';
export async function refreshedPublicationFixture(
  db: Database,
  f: Awaited<ReturnType<typeof publicationFixture>>,
  title = 'A reviewed replacement title',
) {
  const workspace = await f.drafts.workspace(f.owner, f.created.branchId),
    copy = structuredClone(workspace.source.copy);
  copy.title = title;
  const preview = await f.drafts.prepare(
      f.owner,
      f.created.branchId,
      workspace.source.sourceRevision,
      copy,
      randomUUID(),
    ),
    bundle = await new PublicContentRepository(db, true).save(
      f.owner,
      preview.draftId,
      {
        snapshotHash: preview.snapshotHash,
        sourceRevision: preview.sourceRevision,
        selectedCheckpointIds: [],
        acknowledged: true,
      },
      randomUUID(),
    ),
    next = { ...f, preview, bundle };
  const input = await approvePublicationFixture(db, next);
  if (!input) throw Error('Technical approval missing');
  return { f: next, input };
}

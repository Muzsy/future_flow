import { randomUUID } from 'node:crypto';
import {
  PublicScenarioPublicationRepository,
  type Database,
} from '@future-flow/database';
import {
  scenarioReleaseFixture,
  completeScenarioFixture,
  scenarioDecision,
  scenarioGrant,
} from './scenario-release-fixtures';

// Synthetic isolated review/accounting evidence. No real provider or public seed.
export async function publicScenarioFixture(
  db: Database,
  allowPersonalization = true,
) {
  const f = await scenarioReleaseFixture(db),
    completed = await completeScenarioFixture(db, f, true),
    curated = await f.release.decide(scenarioDecision(f, completed.view)),
    granted = await f.release.grant(scenarioGrant(f, curated)),
    pubs = new PublicScenarioPublicationRepository(db, {
      enabled: true,
      operatorEnabled: true,
    }),
    request = {
      templateHash: f.version.templateHash,
      sourceGrantId: granted.sourceGrant!.id,
      allowPersonalization,
    };
  const preview = await pubs.prepare(
    f.owner,
    f.version.id,
    request,
    randomUUID(),
  );
  const confirm = {
    previewId: preview.id,
    previewHash: preview.previewHash,
    acknowledged: true,
    personalizationAcknowledged: allowPersonalization,
  };
  return { ...f, pubs, request, preview, confirm };
}

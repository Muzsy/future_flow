import { randomUUID } from 'node:crypto';
import {
  PUBLIC_SCENARIO_VERSION,
  publicScenarioSlugSchema,
  publicScenarioPrepareRequestSchema,
  publicScenarioPreviewSchema,
  publicScenarioConfirmRequestSchema,
  publicScenarioOwnerSchema,
  publicScenarioReaderSchema,
  publicScenarioModerationSchema,
  SCENARIO_UI_VERSION,
  scenarioPublicationSourceSchema,
  scenarioOwnedPublicationsSchema,
  scenarioDiscoveryQuerySchema,
  scenarioDiscoveryCardSchema,
  scenarioDiscoveryPageSchema,
} from '@future-flow/contracts';
import { DomainError, hash, validateScenarioTemplate } from '@future-flow/core';
import type { Database } from './index';
import { lifeRow } from './lives';
import { ScenarioReleaseRepository } from './scenario-release';

export type PublicScenarioConfig = {
  enabled: boolean;
  operatorEnabled: boolean;
};
export function publicScenarioConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PublicScenarioConfig {
  const flag = (name: string) => {
    const value = env[name] ?? 'false';
    if (!['true', 'false'].includes(value))
      throw Error('Invalid public Scenario configuration');
    return value === 'true';
  };
  return {
    enabled: flag('PUBLIC_SCENARIOS_ENABLED'),
    operatorEnabled: flag('SCENARIO_PUBLICATION_OPERATOR_ENABLED'),
  };
}
type Row = Record<string, unknown>;
const missing = () =>
  new DomainError('RESOURCE_NOT_FOUND', 'This Scenario is unavailable.', 404);
const changed = () =>
  new DomainError(
    'PUBLIC_SCENARIO_CHANGED',
    'Review the current Scenario and permissions.',
    409,
  );
const date = (value: unknown) =>
  value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();

export class PublicScenarioPublicationRepository {
  constructor(
    private readonly db: Database,
    private readonly config: PublicScenarioConfig = {
      enabled: false,
      operatorEnabled: false,
    },
  ) {
    if (
      typeof config.enabled !== 'boolean' ||
      typeof config.operatorEnabled !== 'boolean'
    )
      throw Error('Invalid public Scenario configuration');
  }
  private gate() {
    if (!this.config.enabled)
      throw new DomainError(
        'PUBLIC_SCENARIO_DISABLED',
        'Public Scenario publication is not open yet.',
        404,
      );
  }
  private async owner(tx: Database, userId: string) {
    const user = lifeRow(
      await tx.query('SELECT status FROM ff_users WHERE id=$1 FOR UPDATE', [
        userId,
      ]),
    );
    if (user.status !== 'active')
      throw new DomainError('ACCOUNT_DELETING', 'Account is deleting.', 403);
    if (
      !(
        await tx.query(
          "SELECT id FROM ff_consents WHERE user_id=$1 AND policy_version='alpha-privacy-v1' AND consent_type='adult_and_ai_acknowledgement'",
          [userId],
        )
      ).length
    )
      throw new DomainError(
        'PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
        'Consent required.',
        403,
      );
  }
  private async source(
    tx: Database,
    userId: string,
    versionId: string,
    grantId: string,
    templateHash: string,
  ) {
    const view = await new ScenarioReleaseRepository(tx).get(userId, versionId);
    if (
      !view.current ||
      !view.sourceGrant?.usable ||
      view.sourceGrant.id !== grantId ||
      view.templateHash !== templateHash ||
      view.curation?.status !== 'scenario_reviewed' ||
      !view.review?.providerEvidence ||
      view.review.report?.verdict !== 'no_findings'
    )
      throw changed();
    const version = lifeRow(
        await tx.query(
          'SELECT template FROM aw_scenario_versions WHERE id=$1 AND user_id=$2',
          [versionId, userId],
        ),
      ),
      template = validateScenarioTemplate(version.template);
    if (hash(template) !== templateHash) throw changed();
    return template;
  }
  private preview(row: Row) {
    const template = validateScenarioTemplate(row.template),
      body = {
        schemaVersion: PUBLIC_SCENARIO_VERSION,
        id: row.id,
        scenarioVersionId: row.scenario_version_id,
        sourceGrantId: row.source_grant_id,
        templateHash: row.template_hash,
        template,
        allowPersonalization: row.allow_personalization,
        expiresAt: date(row.expires_at),
        publicationApproved: false,
        officialLifeApproved: false,
      };
    if (hash(template) !== row.template_hash || hash(body) !== row.preview_hash)
      throw changed();
    return publicScenarioPreviewSchema.parse({
      ...body,
      previewHash: row.preview_hash,
    });
  }
  private view(row: Row) {
    return publicScenarioOwnerSchema.parse({
      schemaVersion: PUBLIC_SCENARIO_VERSION,
      id: row.id,
      slug: row.slug,
      status: row.status,
      templateHash: row.template_hash,
      allowPersonalization: row.allow_personalization,
      officialLifeApproved: false,
    });
  }
  private async once<T>(
    userId: string,
    scope: string,
    key: string,
    input: unknown,
    run: (tx: Database) => Promise<{ id: string; result: T }>,
    replay: (tx: Database, id: string) => Promise<T>,
  ) {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const [old] = await tx.query<{
        input_hash: string;
        response: { id: string };
      }>(
        'SELECT input_hash,response FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
        [userId, scope, key],
      );
      if (old) {
        if (old.input_hash !== hash(input))
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Request key has changed input.',
            409,
          );
        return replay(tx, old.response.id);
      }
      this.gate();
      const { id, result } = await run(tx);
      await tx.query(
        'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
        [userId, scope, key, hash(input), JSON.stringify({ id })],
      );
      return result;
    });
  }
  async prepare(userId: string, versionId: string, raw: unknown, key: string) {
    const input = publicScenarioPrepareRequestSchema.parse(raw);
    const replay = async (tx: Database, id: string) =>
      this.preview(
        lifeRow(
          await tx.query(
            'SELECT * FROM aw_public_scenario_previews WHERE id=$1 AND user_id=$2',
            [id, userId],
          ),
        ),
      );
    return this.once(
      userId,
      'scenario-publication:prepare',
      key,
      { versionId, ...input },
      async (tx) => {
        const template = await this.source(
            tx,
            userId,
            versionId,
            input.sourceGrantId,
            input.templateHash,
          ),
          [count] = await tx.query(
            'SELECT count(*)::int AS total FROM aw_public_scenario_previews WHERE user_id=$1',
            [userId],
          );
        if (Number(count!.total) >= 500)
          throw new DomainError(
            'SCENARIO_LIMIT',
            'Scenario publication preparation limit reached.',
            429,
          );
        const [clock] = await tx.query<{ until: Date }>(
            "SELECT clock_timestamp()+interval '30 minutes' AS until",
          ),
          body = {
            schemaVersion: PUBLIC_SCENARIO_VERSION,
            id: randomUUID(),
            scenarioVersionId: versionId,
            sourceGrantId: input.sourceGrantId,
            templateHash: input.templateHash,
            template,
            allowPersonalization: input.allowPersonalization,
            expiresAt: date(clock!.until),
            publicationApproved: false,
            officialLifeApproved: false,
          };
        await tx.query(
          'INSERT INTO aw_public_scenario_previews(id,user_id,scenario_version_id,source_grant_id,template_hash,preview_hash,template,allow_personalization,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            body.id,
            userId,
            versionId,
            input.sourceGrantId,
            input.templateHash,
            hash(body),
            JSON.stringify(template),
            input.allowPersonalization,
            body.expiresAt,
          ],
        );
        return { id: body.id, result: await replay(tx, body.id) };
      },
      replay,
    );
  }
  async confirm(userId: string, raw: unknown, key: string) {
    const input = publicScenarioConfirmRequestSchema.parse(raw),
      replay = async (tx: Database, id: string) =>
        this.view(
          lifeRow(
            await tx.query(
              'SELECT * FROM aw_scenario_publications WHERE id=$1 AND user_id=$2',
              [id, userId],
            ),
          ),
        );
    return this.once(
      userId,
      'scenario-publication:confirm',
      key,
      input,
      async (tx) => {
        const preview = this.preview(
          lifeRow(
            await tx.query(
              'SELECT * FROM aw_public_scenario_previews WHERE id=$1 AND user_id=$2',
              [input.previewId, userId],
            ),
          ),
        );
        if (
          preview.previewHash !== input.previewHash ||
          input.personalizationAcknowledged !== preview.allowPersonalization
        )
          throw changed();
        // Confirming the same exact prepared copy cannot revive a stopped snapshot.
        const [existing] = await tx.query(
          'SELECT id FROM aw_scenario_publications WHERE preview_id=$1 AND user_id=$2',
          [preview.id, userId],
        );
        if (existing)
          return {
            id: String(existing.id),
            result: await replay(tx, String(existing.id)),
          };
        await this.source(
          tx,
          userId,
          preview.scenarioVersionId,
          preview.sourceGrantId,
          preview.templateHash,
        );
        const [clock] = await tx.query<{ valid: boolean }>(
          'SELECT $1::timestamptz>clock_timestamp() AS valid',
          [preview.expiresAt],
        );
        if (!clock!.valid)
          throw new DomainError(
            'PUBLIC_SCENARIO_PREVIEW_EXPIRED',
            'Prepare a new Scenario publication preview.',
            409,
          );
        if (
          (
            await tx.query(
              "SELECT id FROM aw_scenario_publications WHERE scenario_version_id=$1 AND status='active'",
              [preview.scenarioVersionId],
            )
          ).length
        )
          throw changed();
        const id = randomUUID(),
          slug = 'scenario-' + randomUUID().replaceAll('-', '');
        await tx.query(
          'INSERT INTO aw_scenario_publications(id,user_id,preview_id,slug,scenario_version_id,source_grant_id,template_hash,snapshot,allow_personalization) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            id,
            userId,
            preview.id,
            slug,
            preview.scenarioVersionId,
            preview.sourceGrantId,
            preview.templateHash,
            JSON.stringify(preview.template),
            preview.allowPersonalization,
          ],
        );
        return { id, result: await replay(tx, id) };
      },
      replay,
    );
  }
  async own(userId: string, id: string) {
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      return this.view(
        lifeRow(
          await tx.query(
            'SELECT * FROM aw_scenario_publications WHERE id=$1 AND user_id=$2',
            [id, userId],
          ),
        ),
      );
    });
  }
  async publicationSource(userId: string, versionId: string) {
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      this.gate();
      const view = await new ScenarioReleaseRepository(tx).get(
        userId,
        versionId,
      );
      if (!view.sourceGrant?.usable) throw changed();
      const template = await this.source(
        tx,
        userId,
        versionId,
        view.sourceGrant.id,
        view.templateHash,
      );
      return scenarioPublicationSourceSchema.parse({
        schemaVersion: SCENARIO_UI_VERSION,
        scenarioVersionId: versionId,
        templateHash: view.templateHash,
        sourceGrantId: view.sourceGrant.id,
        template,
        publicationApproved: false,
        officialLifeApproved: false,
      });
    });
  }
  async forVersion(userId: string, versionId: string) {
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      lifeRow(
        await tx.query(
          'SELECT id FROM aw_scenario_versions WHERE id=$1 AND user_id=$2',
          [versionId, userId],
        ),
      );
      const rows = await tx.query(
        'SELECT * FROM aw_scenario_publications WHERE scenario_version_id=$1 AND user_id=$2 ORDER BY published_at DESC,id DESC LIMIT 100',
        [versionId, userId],
      );
      return scenarioOwnedPublicationsSchema.parse({
        schemaVersion: SCENARIO_UI_VERSION,
        scenarioVersionId: versionId,
        publications: rows.map((row) => this.view(row)),
      });
    });
  }
  async withdraw(userId: string, id: string) {
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const row = lifeRow(
        await tx.query(
          'SELECT * FROM aw_scenario_publications WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [id, userId],
        ),
      );
      if (row.status === 'active')
        return this.view(
          lifeRow(
            await tx.query(
              "UPDATE aw_scenario_publications SET status='withdrawn',stopped_at=clock_timestamp() WHERE id=$1 RETURNING *",
              [id],
            ),
          ),
        );
      return this.view(row);
    });
  }
  async list(raw: unknown = {}) {
    this.gate();
    const query = scenarioDiscoveryQuerySchema.parse(raw),
      pattern = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%';
    // Candidate metadata is never an anonymous response. Every card, including
    // the pagination sentinel, passes the live source/consent/provenance reader.
    const rows = await this.db.query<{ slug: string }>(
      `SELECT p.slug FROM aw_scenario_publications p
       JOIN ff_users u ON u.id=p.user_id
       JOIN aw_official_scenario_sources s ON s.id=p.source_grant_id AND s.user_id=p.user_id AND s.scenario_version_id=p.scenario_version_id
       WHERE p.status='active' AND u.status='active' AND s.status='active'
         AND p.snapshot->>'contentLocale'='en'
         AND ((p.snapshot->>'title')||' '||(p.snapshot->>'summary')) ILIKE $1 ESCAPE E'\\\\'
       ORDER BY p.published_at DESC,p.slug ASC LIMIT $2 OFFSET $3`,
      [pattern, query.pageSize + 1, (query.page - 1) * query.pageSize],
    );
    const items = [];
    for (const row of rows) {
      try {
        const reader = await this.read(row.slug),
          goal =
            reader.template.goals.find((g) => g.priority === 'primary') ??
            reader.template.goals[0]!;
        items.push(
          scenarioDiscoveryCardSchema.parse({
            slug: reader.slug,
            contentLocale: reader.template.contentLocale,
            title: reader.template.title,
            summary: reader.template.summary,
            goalDescription: goal.description,
            officialScenario: reader.officialScenario,
            officialLifeApproved: reader.officialLifeApproved,
            allowPersonalization: reader.allowPersonalization,
            publishedAt: reader.publishedAt,
          }),
        );
      } catch (error) {
        if (!(error instanceof DomainError) || error.status !== 404)
          throw error;
      }
    }
    return scenarioDiscoveryPageSchema.parse({
      schemaVersion: 'scenario-discovery-1',
      contentLocale: 'en',
      ranking: 'newest',
      page: query.page,
      pageSize: query.pageSize,
      hasMore: query.page < 100 && items.length > query.pageSize,
      items: items.slice(0, query.pageSize),
    });
  }
  async read(rawSlug: unknown) {
    const slug = publicScenarioSlugSchema.parse(rawSlug);
    this.gate();
    const [hint] = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM aw_scenario_publications WHERE slug=$1',
      [slug],
    );
    if (!hint) throw missing();
    return this.db.transaction(async (tx) => {
      try {
        await this.owner(tx, hint.user_id);
        const row = lifeRow(
          await tx.query(
            'SELECT * FROM aw_scenario_publications WHERE slug=$1 AND user_id=$2',
            [slug, hint.user_id],
          ),
        );
        if (row.status !== 'active') throw missing();
        const template = await this.source(
            tx,
            hint.user_id,
            String(row.scenario_version_id),
            String(row.source_grant_id),
            String(row.template_hash),
          ),
          snapshot = validateScenarioTemplate(row.snapshot);
        if (hash(snapshot) !== hash(template)) throw missing();
        return publicScenarioReaderSchema.parse({
          schemaVersion: PUBLIC_SCENARIO_VERSION,
          slug,
          templateHash: row.template_hash,
          template: snapshot,
          allowPersonalization: row.allow_personalization,
          officialScenario: true,
          officialLifeApproved: false,
          publishedAt: date(row.published_at),
        });
      } catch (error) {
        if (error instanceof DomainError) throw missing();
        throw error;
      }
    });
  }
  async moderate(userId: string, id: string, raw: unknown) {
    if (!this.config.operatorEnabled)
      throw new DomainError(
        'PUBLIC_SCENARIO_OPERATOR_DISABLED',
        'Trusted Scenario moderation required.',
        403,
      );
    const input = publicScenarioModerationSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      lifeRow(
        await tx.query('SELECT id FROM ff_users WHERE id=$1 FOR UPDATE', [
          userId,
        ]),
      );
      const row = lifeRow(
        await tx.query(
          'SELECT * FROM aw_scenario_publications WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [id, userId],
        ),
      );
      if (row.status === input.status) return this.view(row);
      if (
        row.status !== 'active' &&
        !(row.status === 'hidden' && input.status === 'removed')
      )
        throw changed();
      const result = lifeRow(
        await tx.query(
          'UPDATE aw_scenario_publications SET status=$1,stopped_at=coalesce(stopped_at,clock_timestamp()) WHERE id=$2 RETURNING *',
          [input.status, id],
        ),
      );
      await tx.query(
        'INSERT INTO aw_scenario_publication_moderation(id,user_id,publication_id,status,reason,actor_label) VALUES($1,$2,$3,$4,$5,$6)',
        [
          randomUUID(),
          userId,
          id,
          input.status,
          input.reason,
          input.actorLabel,
        ],
      );
      return this.view(result);
    });
  }
}

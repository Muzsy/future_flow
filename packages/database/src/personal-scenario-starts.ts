import { randomUUID } from 'node:crypto';
import {
  PERSONAL_SCENARIO_VERSION,
  personalScenarioPrepareRequestSchema,
  personalScenarioPreviewSchema,
  personalScenarioStartRequestSchema,
  personalScenarioStartReceiptSchema,
  personalScenarioAttributionSchema,
  scenarioPersonalProfileSchema,
  scenarioPersonalizationPreviewSchema,
  publicScenarioSlugSchema,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  prepareScenarioPersonalization,
  instantiateScenarioPersonalization,
} from '@future-flow/core';
import { LifeRepository, lifeRow } from './lives';
import {
  PublicScenarioPublicationRepository,
  publicScenarioConfigFromEnv,
  type PublicScenarioConfig,
} from './public-scenario-publications';
import type { Database } from './index';

export type PersonalScenarioConfig = { enabled: boolean };
export function personalScenarioConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PersonalScenarioConfig {
  const value = env.SCENARIO_PERSONALIZATION_ENABLED ?? 'false';
  if (!['true', 'false'].includes(value))
    throw Error('Invalid personal Scenario configuration');
  const enabled = value === 'true';
  if (enabled && !publicScenarioConfigFromEnv(env).enabled)
    throw Error('Personal Scenarios require public Scenarios');
  return { enabled };
}
type Row = Record<string, unknown>;
type Hint = { id: string; user_id: string };
const missing = () =>
  new DomainError(
    'RESOURCE_NOT_FOUND',
    'This starting point is unavailable.',
    404,
  );
const changed = () =>
  new DomainError(
    'PERSONAL_SCENARIO_CHANGED',
    'Review the complete current starting context before creating a life.',
    409,
  );
const iso = (value: unknown) =>
  value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();

// All profiles and previews remain private. The only public input is a reviewed
// immutable Scenario; a browser never supplies a prepared life or history graph.
export class PersonalScenarioRepository {
  constructor(
    private readonly db: Database,
    private readonly config: PersonalScenarioConfig = { enabled: false },
    private readonly publicConfig: PublicScenarioConfig = {
      enabled: false,
      operatorEnabled: false,
    },
    private readonly limits = { daily: 10, concurrent: 2 },
  ) {
    if (
      typeof config.enabled !== 'boolean' ||
      (config.enabled && !publicConfig.enabled)
    )
      throw Error('Invalid personal Scenario configuration');
  }
  private gate() {
    if (!this.config.enabled || !this.publicConfig.enabled)
      throw new DomainError(
        'PERSONAL_SCENARIO_DISABLED',
        'Personal Scenario starts are not open yet.',
        404,
      );
  }
  private async hint(slug: string) {
    return (
      await this.db.query<Hint>(
        'SELECT id,user_id FROM aw_scenario_publications WHERE slug=$1',
        [slug],
      )
    )[0];
  }
  private async lock(tx: Database, userId: string, hint?: Hint) {
    // Match the source's UPDATE lock from the outset. SHARE then upgrading can
    // deadlock when two owners personalize one another's Scenarios.
    const users = await tx.query<{ id: string; status: string }>(
      'SELECT id,status FROM ff_users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [[...new Set([userId, ...(hint ? [hint.user_id] : [])])].sort()],
    );
    if (!users.some((u) => u.id === userId && u.status === 'active'))
      throw missing();
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
    return users;
  }
  private async source(tx: Database, slug: string, hint?: Hint) {
    if (!hint) throw missing();
    const row = lifeRow(
      await tx.query(
        'SELECT id,user_id FROM aw_scenario_publications WHERE slug=$1',
        [slug],
      ),
    );
    if (row.id !== hint.id || row.user_id !== hint.user_id) throw missing();
    const source = await new PublicScenarioPublicationRepository(
      tx,
      this.publicConfig,
    ).read(slug);
    if (!source.allowPersonalization) throw missing();
    return source;
  }
  private view(row: Row) {
    const profile = scenarioPersonalProfileSchema.parse(row.profile),
      composition = scenarioPersonalizationPreviewSchema.parse(row.composition),
      body = {
        schemaVersion: PERSONAL_SCENARIO_VERSION,
        id: row.id,
        sourceSlug: row.source_slug,
        templateHash: row.template_hash,
        profileHash: row.profile_hash,
        profile,
        expiresAt: iso(row.expires_at),
        composition,
        publicationApproved: false,
        officialLifeApproved: false,
      };
    if (
      hash(profile) !== row.profile_hash ||
      composition.profileHash !== row.profile_hash ||
      composition.templateHash !== row.template_hash ||
      hash(body) !== row.preview_hash
    )
      throw changed();
    return personalScenarioPreviewSchema.parse({
      ...body,
      previewHash: row.preview_hash,
    });
  }
  private async valid(tx: Database, row: Row, hint?: Hint) {
    const preview = this.view(row),
      source = await this.source(tx, preview.sourceSlug, hint),
      current = prepareScenarioPersonalization(source.template, row.profile);
    if (
      source.templateHash !== preview.templateHash ||
      current.previewHash !== preview.composition.previewHash
    )
      throw changed();
    const [clock] = await tx.query<{ valid: boolean }>(
      'SELECT $1::timestamptz>clock_timestamp() AS valid',
      [preview.expiresAt],
    );
    if (!clock!.valid)
      throw new DomainError(
        'PERSONAL_SCENARIO_PREVIEW_EXPIRED',
        'Prepare a new personal starting preview.',
        409,
      );
    return { preview, source };
  }
  private async once<T>(
    userId: string,
    slug: string,
    scope: string,
    key: string,
    input: unknown,
    run: (tx: Database, hint?: Hint) => Promise<T>,
    replay: (tx: Database, response: unknown, hint?: Hint) => Promise<T>,
    record?: (result: T) => unknown,
  ) {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    const hint = await this.hint(slug),
      inputHash = hash(input);
    return this.db.transaction(async (tx) => {
      await this.lock(tx, userId, hint);
      const [old] = await tx.query<{ input_hash: string; response: unknown }>(
        'SELECT input_hash,response FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
        [userId, scope, key],
      );
      if (old) {
        if (old.input_hash !== inputHash)
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'This request key has a different starting context.',
            409,
          );
        return replay(tx, old.response, hint);
      }
      this.gate();
      const result = await run(tx, hint);
      await tx.query(
        'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
        [
          userId,
          scope,
          key,
          inputHash,
          JSON.stringify(record ? record(result) : result),
        ],
      );
      return result;
    });
  }
  async prepare(userId: string, rawSlug: unknown, raw: unknown, key: string) {
    const slug = publicScenarioSlugSchema.parse(rawSlug),
      input = personalScenarioPrepareRequestSchema.parse(raw);
    return this.once(
      userId,
      slug,
      'v2:personal-scenario-preview:' + slug,
      key,
      input,
      async (tx, hint) => {
        const source = await this.source(tx, slug, hint);
        if (source.templateHash !== input.templateHash) throw changed();
        const composition = prepareScenarioPersonalization(
          source.template,
          input.profile,
        );
        const [count] = await tx.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM aw_personal_scenario_previews WHERE user_id=$1',
          [userId],
        );
        if (count!.count >= 500)
          throw new DomainError(
            'PERSONAL_SCENARIO_PREVIEW_LIMIT',
            'Too many personal previews. Try again after expired previews are cleared.',
            429,
          );
        const id = randomUUID(),
          [clock] = await tx.query<{ expires_at: Date }>(
            "SELECT clock_timestamp()+interval '30 minutes' AS expires_at",
          ),
          body = {
            schemaVersion: PERSONAL_SCENARIO_VERSION,
            id,
            sourceSlug: slug,
            templateHash: source.templateHash,
            profileHash: hash(input.profile),
            profile: input.profile,
            expiresAt: iso(clock!.expires_at),
            composition,
            publicationApproved: false,
            officialLifeApproved: false,
          },
          preview = personalScenarioPreviewSchema.parse({
            ...body,
            previewHash: hash(body),
          });
        await tx.query(
          'INSERT INTO aw_personal_scenario_previews(id,user_id,publication_id,source_slug,template_hash,profile_hash,preview_hash,profile,composition,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [
            id,
            userId,
            hint!.id,
            slug,
            preview.templateHash,
            preview.profileHash,
            preview.previewHash,
            JSON.stringify(input.profile),
            JSON.stringify(composition),
            preview.expiresAt,
          ],
        );
        return preview;
      },
      async (tx, response, hint) => {
        const id = personalScenarioPreviewSchema.shape.id.parse(
            (response as { id?: unknown } | null)?.id,
          ),
          row = lifeRow(
            await tx.query(
              'SELECT * FROM aw_personal_scenario_previews WHERE id=$1 AND user_id=$2 FOR SHARE',
              [id, userId],
            ),
          );
        return (await this.valid(tx, row, hint)).preview;
      },
      (result) => ({ id: result.id }),
    );
  }
  async preview(userId: string, rawId: unknown) {
    const id = personalScenarioPreviewSchema.shape.id.parse(rawId);
    this.gate();
    const [ownHint] = await this.db.query<{ source_slug: string }>(
      'SELECT source_slug FROM aw_personal_scenario_previews WHERE id=$1 AND user_id=$2',
      [id, userId],
    );
    if (!ownHint) throw missing();
    const hint = await this.hint(ownHint.source_slug);
    return this.db.transaction(async (tx) => {
      await this.lock(tx, userId, hint);
      const row = lifeRow(
        await tx.query(
          'SELECT * FROM aw_personal_scenario_previews WHERE id=$1 AND user_id=$2 FOR SHARE',
          [id, userId],
        ),
      );
      return (await this.valid(tx, row, hint)).preview;
    });
  }
  async start(userId: string, rawSlug: unknown, raw: unknown, key: string) {
    const slug = publicScenarioSlugSchema.parse(rawSlug),
      input = personalScenarioStartRequestSchema.parse(raw),
      scope = 'v2:personal-scenario:' + slug;
    return this.once(
      userId,
      slug,
      scope,
      key,
      input,
      async (tx, hint) => {
        const row = lifeRow(
          await tx.query(
            'SELECT * FROM aw_personal_scenario_previews WHERE id=$1 AND user_id=$2 FOR SHARE',
            [input.previewId, userId],
          ),
        );
        if (
          row.source_slug !== slug ||
          row.publication_id !== hint?.id ||
          row.profile_hash !== hash(input.profile)
        )
          throw changed();
        const { preview, source } = await this.valid(tx, row, hint);
        if (preview.previewHash !== input.previewHash) throw changed();
        if (
          (
            await tx.query(
              'SELECT life_id FROM aw_personal_scenario_starts WHERE preview_id=$1',
              [preview.id],
            )
          ).length
        )
          throw new DomainError(
            'PERSONAL_SCENARIO_ALREADY_STARTED',
            'This preview already created a private life. Prepare a new preview to create another.',
            409,
          );
        const prepared = instantiateScenarioPersonalization(
            source.template,
            input.profile,
            {
              previewHash: preview.composition.previewHash,
              acknowledged: true,
            },
          ),
          created = await new LifeRepository(tx, this.limits).createPrepared(
            userId,
            prepared,
            hash({ scope, key }),
          );
        await tx.query(
          'INSERT INTO aw_personal_scenario_starts(life_id,user_id,branch_id,publication_id,preview_id,source_slug,template_hash,profile_hash,preview_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            created.lifeId,
            userId,
            created.branchId,
            hint!.id,
            preview.id,
            slug,
            preview.templateHash,
            preview.profileHash,
            preview.previewHash,
          ],
        );
        return personalScenarioStartReceiptSchema.parse({
          schemaVersion: PERSONAL_SCENARIO_VERSION,
          ...created,
        });
      },
      async (tx, response) => {
        if ((response as { deleted?: boolean } | null)?.deleted === true)
          throw new DomainError(
            'PERSONAL_SCENARIO_DELETED',
            'This private life was deleted. A new life requires a new preview and explicit request.',
            410,
          );
        const receipt = personalScenarioStartReceiptSchema.parse(response);
        lifeRow(
          await tx.query('SELECT id FROM aw_lives WHERE id=$1 AND user_id=$2', [
            receipt.lifeId,
            userId,
          ]),
        );
        return receipt;
      },
    );
  }
  async attribution(userId: string, rawLifeId: unknown) {
    const lifeId =
        personalScenarioStartReceiptSchema.shape.lifeId.parse(rawLifeId),
      [originHint] = await this.db.query<{ source_slug: string }>(
        'SELECT source_slug FROM aw_personal_scenario_starts WHERE life_id=$1 AND user_id=$2',
        [lifeId, userId],
      );
    if (!originHint) throw missing();
    const hint = await this.hint(originHint.source_slug);
    return this.db.transaction(async (tx) => {
      await this.lock(tx, userId, hint);
      const start = lifeRow(
        await tx.query(
          'SELECT * FROM aw_personal_scenario_starts WHERE life_id=$1 AND user_id=$2',
          [lifeId, userId],
        ),
      );
      let source: unknown = null;
      if (start.publication_id && hint?.id === start.publication_id)
        try {
          const current = await new PublicScenarioPublicationRepository(
            tx,
            this.publicConfig,
          ).read(originHint.source_slug);
          source = {
            slug: current.slug,
            title: current.template.title,
            officialScenario: true,
          };
        } catch (e) {
          if (!(e instanceof DomainError && e.status === 404)) throw e;
        }
      return personalScenarioAttributionSchema.parse({
        schemaVersion: PERSONAL_SCENARIO_VERSION,
        lifeId,
        origin: 'personalized_scenario',
        source,
      });
    });
  }
}

export async function cleanupExpiredPersonalScenarioPreviews(db: Database) {
  const [storage] = await db.query(
    "SELECT to_regclass('public.aw_personal_scenario_previews') IS NOT NULL AS present",
  );
  if (!storage?.present) return { deleted: 0, batchFull: false };
  const rows = await db.query(
    "DELETE FROM aw_personal_scenario_previews WHERE id IN (SELECT id FROM aw_personal_scenario_previews WHERE expires_at<clock_timestamp()-interval '24 hours' ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED) RETURNING id",
  );
  return { deleted: rows.length, batchFull: rows.length === 1000 };
}

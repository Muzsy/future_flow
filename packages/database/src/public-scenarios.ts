import { randomUUID } from 'node:crypto';
import {
  SCENARIO_CONTRACT_VERSION,
  scenarioCreateRequestSchema,
  scenarioVersionRequestSchema,
  scenarioStartRequestSchema,
  scenarioVersionSchema,
  type ScenarioVersion,
  type ScenarioTemplate,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  validateScenarioTemplate,
  instantiateScenarioTemplate,
} from '@future-flow/core';
import type { Database } from './index';
import { LifeRepository, lifeRow } from './lives';

export function scenarioVersionsEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.SCENARIO_VERSIONS_ENABLED === undefined) return false;
  if (!['true', 'false'].includes(env.SCENARIO_VERSIONS_ENABLED))
    throw new DomainError('SCENARIO_CONFIG', 'Invalid scenario configuration.');
  return env.SCENARIO_VERSIONS_ENABLED === 'true';
}
type VersionRow = Record<string, unknown> & {
  id: string;
  scenario_id: string;
  version: number;
  template: ScenarioTemplate;
  template_hash: string;
};

export class ScenarioRepository {
  constructor(
    private readonly db: Database,
    private readonly enabled = false,
    private readonly limits = { daily: 10, concurrent: 2 },
  ) {}
  private async lock(tx: Database, userId: string) {
    const user = lifeRow(
      await tx.query('SELECT status FROM ff_users WHERE id=$1 FOR UPDATE', [
        userId,
      ]),
    );
    if (user.status !== 'active')
      throw new DomainError(
        'ACCOUNT_DELETING',
        'Account is being deleted.',
        403,
      );
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
  private gate() {
    if (!this.enabled)
      throw new DomainError(
        'SCENARIO_DISABLED',
        'Scenario preparation unavailable.',
        403,
      );
  }
  private view(row: VersionRow): ScenarioVersion {
    const template = validateScenarioTemplate(row.template);
    if (hash(template) !== row.template_hash)
      throw new DomainError(
        'SCENARIO_INVALID',
        'Template integrity check failed.',
        409,
      );
    return scenarioVersionSchema.parse({
      id: row.id,
      scenarioId: row.scenario_id,
      version: row.version,
      templateHash: row.template_hash,
      template,
      status: 'awaiting_review',
      publicationApproved: false,
    });
  }
  private async once<T>(
    userId: string,
    scope: string,
    key: string,
    input: unknown,
    run: (tx: Database) => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    return this.db.transaction(async (tx) => {
      await this.lock(tx, userId);
      this.gate();
      const old = (
        await tx.query<{ input_hash: string; response: T }>(
          'SELECT input_hash,response FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
          [userId, scope, key],
        )
      )[0];
      if (old) {
        if (old.input_hash !== hash(input))
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Request key conflict.',
            409,
          );
        return old.response;
      }
      const result = await run(tx);
      await tx.query(
        'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
        [userId, scope, key, hash(input), JSON.stringify(result)],
      );
      return result;
    });
  }
  private async append(
    tx: Database,
    userId: string,
    scenarioId: string,
    version: number,
    template: ScenarioTemplate,
  ) {
    return this.view(
      lifeRow(
        await tx.query<VersionRow>(
          'INSERT INTO aw_scenario_versions(id,user_id,scenario_id,version,schema_version,content_locale,template,template_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            randomUUID(),
            userId,
            scenarioId,
            version,
            SCENARIO_CONTRACT_VERSION,
            'en',
            JSON.stringify(template),
            hash(template),
          ],
        ),
      ),
    );
  }
  async create(userId: string, raw: unknown, key: string) {
    const input = scenarioCreateRequestSchema.parse(raw),
      template = validateScenarioTemplate(input.template);
    return this.once(userId, 'scenario:create', key, input, async (tx) => {
      const [count] = await tx.query(
        'SELECT count(*)::int AS total FROM aw_scenarios WHERE user_id=$1',
        [userId],
      );
      if (Number(count!.total) >= 100)
        throw new DomainError('SCENARIO_LIMIT', 'Scenario limit reached.', 429);
      const scenarioId = randomUUID();
      await tx.query(
        'INSERT INTO aw_scenarios(id,user_id,current_version) VALUES($1,$2,1)',
        [scenarioId, userId],
      );
      return this.append(tx, userId, scenarioId, 1, template);
    });
  }
  async revise(userId: string, scenarioId: string, raw: unknown, key: string) {
    const input = scenarioVersionRequestSchema.parse(raw),
      template = validateScenarioTemplate(input.template);
    return this.once(
      userId,
      'scenario:revise',
      key,
      { scenarioId, ...input },
      async (tx) => {
        const current = lifeRow(
          await tx.query<VersionRow>(
            'SELECT v.* FROM aw_scenarios s JOIN aw_scenario_versions v ON v.scenario_id=s.id AND v.version=s.current_version WHERE s.id=$1 AND s.user_id=$2 FOR UPDATE OF s',
            [scenarioId, userId],
          ),
        );
        if (
          current.version !== input.expectedVersion ||
          current.template_hash !== input.expectedHash
        )
          throw new DomainError(
            'SCENARIO_REVISION_CONFLICT',
            'Reload the current scenario.',
            409,
          );
        if (current.version >= 100)
          throw new DomainError(
            'SCENARIO_LIMIT',
            'Scenario version limit reached.',
            429,
          );
        const result = await this.append(
          tx,
          userId,
          scenarioId,
          current.version + 1,
          template,
        );
        await tx.query(
          'UPDATE aw_scenarios SET current_version=$1 WHERE id=$2 AND user_id=$3',
          [result.version, scenarioId, userId],
        );
        return result;
      },
    );
  }
  async get(userId: string, versionId: string) {
    return this.db.transaction(async (tx) => {
      await this.lock(tx, userId);
      this.gate();
      return this.view(
        lifeRow(
          await tx.query<VersionRow>(
            'SELECT * FROM aw_scenario_versions WHERE id=$1 AND user_id=$2',
            [versionId, userId],
          ),
        ),
      );
    });
  }
  async list(userId: string) {
    return this.db.transaction(async (tx) => {
      await this.lock(tx, userId);
      this.gate();
      return (
        await tx.query<VersionRow>(
          'SELECT v.* FROM aw_scenarios s JOIN aw_scenario_versions v ON v.scenario_id=s.id AND v.version=s.current_version WHERE s.user_id=$1 ORDER BY s.created_at DESC,s.id LIMIT 100',
          [userId],
        )
      ).map((row) => this.view(row));
    });
  }
  async start(userId: string, versionId: string, raw: unknown, key: string) {
    const input = scenarioStartRequestSchema.parse(raw);
    return this.once(
      userId,
      'scenario:start',
      key,
      { versionId, ...input },
      async (tx) => {
        const version = this.view(
          lifeRow(
            await tx.query<VersionRow>(
              'SELECT * FROM aw_scenario_versions WHERE id=$1 AND user_id=$2',
              [versionId, userId],
            ),
          ),
        );
        if (version.templateHash !== input.templateHash)
          throw new DomainError(
            'SCENARIO_REVISION_CONFLICT',
            'Template binding changed.',
            409,
          );
        const lifeInput = instantiateScenarioTemplate(version.template),
          created = await new LifeRepository(tx, this.limits).createPrepared(
            userId,
            lifeInput,
            key,
          );
        await tx.query(
          'INSERT INTO aw_scenario_starts(life_id,user_id,scenario_version_id,template_hash) VALUES($1,$2,$3,$4)',
          [lifeInput.lifeId, userId, version.id, version.templateHash],
        );
        return created;
      },
    );
  }
}
